// The Python bridge between OpenBot and Keeper Commander. The installer writes it next to Commander,
// and the Keeper driver runs it with the Python of that install. It is kept here as text, so the app
// bundle needs no extra file. A raw template keeps the backslashes of the Python code.

export const KEEPER_HELPER_FILE_NAME = "openbot_keeper.py";

export const KEEPER_HELPER_SCRIPT = String.raw`# OpenBot's bridge to Keeper Commander. OpenBot runs this file with the Python of its own Commander
# install ('python -I'). It does not change Commander; it calls Commander's login flow and vault.
#
# Protocol: one JSON object per line. The first stdin line is the request:
#   {"op": "login" | "list" | "secret" | "logout", "config": {...} | null, ...}
# 'login' also has "email" and "password"; 'secret' has "uid" and "kind" ("password" | "totp").
# During 'login', stdout can send {"event": "step", "step": "two-factor" | "device-approval",
# "error": null | "code" | "pending"}; the next stdin line answers it: {"code": "..."}.
# The last stdout line is {"event": "done", "config": {...}, ...} or {"event": "error", "code": "...",
# "config": {...} | null}. Secrets come only on stdin, never in an argument. Commander's own output
# goes to stderr, which OpenBot does not log.

import json
import os
import sys
import tempfile

PROTOCOL = os.fdopen(os.dup(1), "w", encoding="utf-8")
os.dup2(2, 1)
os.environ["KEEPER_CONFIG_STORAGE"] = "file"

import logging  # noqa: E402

logging.basicConfig(level=logging.ERROR, stream=sys.stderr)

from keepercommander import api, cli, utils  # noqa: E402
from keepercommander.auth import login_steps  # noqa: E402
from keepercommander.config_storage import loader  # noqa: E402
from keepercommander.error import KeeperApiError  # noqa: E402
from keepercommander.params import KeeperParams  # noqa: E402
from keepercommander import rest_api, vault  # noqa: E402
from keepercommander.record import get_totp_code  # noqa: E402

SHARED_FOLDER = "Shared with OpenBot"
CODE_CHANNELS = (
    login_steps.TwoFactorChannel.Authenticator,
    login_steps.TwoFactorChannel.TextMessage,
    login_steps.TwoFactorChannel.DuoSecurity,
    login_steps.TwoFactorChannel.RSASecurID,
    login_steps.TwoFactorChannel.KeeperDNA,
    login_steps.TwoFactorChannel.Backup,
)


class Failure(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def send(message):
    PROTOCOL.write(json.dumps(message) + "\n")
    PROTOCOL.flush()


def raise_if_throttled(error):
    if getattr(error, "result_code", "") == "throttled":
        raise Failure("throttled")


def answer():
    line = sys.stdin.readline()
    if not line:
        raise Failure("cancelled")
    value = json.loads(line)
    code = value.get("code") if isinstance(value, dict) else None
    if not isinstance(code, str):
        raise Failure("cancelled")
    return code.strip()


class AccountUi(login_steps.LoginUi):
    """Answers Commander's login steps with the request's password and the user's codes."""

    def __init__(self, password):
        self.password = password
        self.password_tries = 0
        self.approval_asked = False
        self.failure = None

    def on_password(self, step):
        self.password_tries += 1
        if self.password_tries > 1 or not self.password:
            self.failure = "password"
            step.cancel()
            return
        try:
            step.verify_password(self.password)
        except KeeperApiError as error:
            raise_if_throttled(error)

    def on_two_factor(self, step):
        channels = [c for c in step.get_channels() if c.channel_type in CODE_CHANNELS]
        if not channels:
            self.failure = "two-factor-unsupported"
            step.cancel()
            return
        channel = channels[0]
        if channel.channel_type == login_steps.TwoFactorChannel.TextMessage:
            try:
                step.send_push(channel.channel_uid, login_steps.TwoFactorPushAction.TextMessage)
            except KeeperApiError:
                pass
        duration = min(step.get_max_duration(), channel.max_expiration, login_steps.TwoFactorDuration.Forever)
        step.duration = duration
        error = None
        while True:
            send({"event": "step", "step": "two-factor", "error": error})
            code = answer()
            if not code:
                error = "code"
                continue
            try:
                step.send_code(channel.channel_uid, code)
                return
            except KeeperApiError as failure:
                raise_if_throttled(failure)
                error = "code"

    def on_device_approval(self, step):
        error = None
        if self.approval_asked:
            error = "pending"
        else:
            self.approval_asked = True
            for channel in (login_steps.DeviceApprovalChannel.Email, login_steps.DeviceApprovalChannel.KeeperPush):
                try:
                    step.send_push(channel)
                except KeeperApiError:
                    pass
        while True:
            send({"event": "step", "step": "device-approval", "error": error})
            code = answer()
            if not code:
                step.resume()
                return
            for channel in (login_steps.DeviceApprovalChannel.Email, login_steps.DeviceApprovalChannel.TwoFactor):
                try:
                    step.send_code(channel, code)
                    return
                except KeeperApiError as failure:
                    raise_if_throttled(failure)
            error = "code"

    def on_sso_redirect(self, step):
        # Commander then tries the account's master password, which an SSO user can make.
        step.cancel()

    def on_sso_data_key(self, step):
        self.failure = "sso"
        step.cancel()


class StoredSessionUi(login_steps.LoginUi):
    """A stored session needs no answer. Any step means that the session ended."""

    def _ended(self, step):
        step.cancel()

    on_device_approval = _ended
    on_two_factor = _ended
    on_password = _ended
    on_sso_redirect = _ended
    on_sso_data_key = _ended


class Session:
    """Commander's config in a private file only while this process runs."""

    def __init__(self, config):
        self.directory = tempfile.mkdtemp(prefix="keeper-")
        self.path = os.path.join(self.directory, "config.json")
        self.params = KeeperParams(config_filename=self.path)
        self.params.config = dict(config or {})
        self.params.config["config_storage"] = "file"
        with open(self.path, "w", encoding="utf-8") as handle:
            json.dump(self.params.config, handle)
        os.chmod(self.path, 0o600)
        loader.load_config_properties(self.params)
        rest_api.load_server_keys(self.params.config)
        if not self.params.server:
            self.params.server = "keepersecurity.com"
        # Commander waits up to minutes when Keeper throttles; the user gets the reason at once instead.
        self.params.rest_context.fail_on_throttle = True

    def config(self):
        try:
            with open(self.path, encoding="utf-8") as handle:
                return json.load(handle)
        except (OSError, ValueError):
            return self.params.config or None

    def close(self):
        for name in os.listdir(self.directory):
            os.remove(os.path.join(self.directory, name))
        os.rmdir(self.directory)


def login_failure(error):
    text = str(error).lower()
    if "throttl" in text or getattr(error, "result_code", "") == "throttled":
        return "throttled"
    if "commander" in text and ("restrict" in text or "permission" in text or "platform" in text):
        return "plan"
    if "locked" in text:
        return "locked"
    if "auth_failed" in text or "user does not exist" in text or "invalid email" in text:
        return "password"
    return "failed"


def find_shared_folder(params):
    root = params.root_folder
    for uid in (root.subfolders if root else []):
        folder = params.folder_cache.get(uid)
        if folder and folder.name == SHARED_FOLDER:
            return folder
    return None


def shared_record_uids(params):
    folder = find_shared_folder(params)
    if not folder:
        return set()
    uids = set()
    pending = [folder.uid]
    while pending:
        uid = pending.pop()
        uids.update(params.subfolder_record_cache.get(uid, set()))
        node = params.folder_cache.get(uid)
        pending.extend(node.subfolders if node else [])
    return uids


def field_values(record, field_type):
    if isinstance(record, vault.TypedRecord):
        values = []
        for field in list(record.fields) + list(record.custom):
            if field.type == field_type:
                values.extend(v for v in field.value if isinstance(v, str) and v)
        return values
    if isinstance(record, vault.PasswordRecord):
        value = {"login": record.login, "password": record.password, "url": record.link, "oneTimeCode": record.totp}
        return [value[field_type]] if value.get(field_type) else []
    return []


def login_entry(params, uid):
    record = vault.KeeperRecord.load(params, uid)
    if record is None or not field_values(record, "password"):
        return None
    usernames = field_values(record, "login") or field_values(record, "email")
    revision = params.record_cache.get(uid, {}).get("revision", 0)
    return {
        "uid": uid,
        "title": record.title,
        "username": usernames[0] if usernames else None,
        "urls": field_values(record, "url"),
        "hasTotp": bool(field_values(record, "oneTimeCode")),
        "revision": revision,
    }


def open_stored(request):
    session = Session(request.get("config"))
    params = session.params
    if not params.user or not params.clone_code:
        raise Failure("expired")
    try:
        api.login(params, login_ui=StoredSessionUi())
    except KeeperApiError as error:
        raise Failure(login_failure(error)) from None
    if not params.session_token:
        raise Failure("expired")
    api.sync_down(params)
    return session


def op_login(request, holder):
    email = request.get("email")
    password = request.get("password")
    if not isinstance(email, str) or not email.strip() or not isinstance(password, str):
        raise Failure("password")
    session = Session(request.get("config"))
    holder.append(session)
    params = session.params
    params.user = email.strip().lower()
    ui = AccountUi(password)
    try:
        api.login(params, new_login=True, login_ui=ui)
    except KeeperApiError as error:
        raise Failure(ui.failure or login_failure(error)) from None
    except Failure:
        raise
    except Exception as error:  # Commander raises plain exceptions for locked and expired accounts.
        raise Failure(ui.failure or login_failure(error)) from None
    if not params.session_token:
        raise Failure(ui.failure or "password")
    send({"event": "step", "step": "setup", "error": None})
    # Persistent login keeps this device signed in, so later calls need no password.
    for command in ("this-device register", "this-device persistent-login on", "this-device timeout 30d"):
        try:
            cli.do_command(params, command)
        except Exception:
            logging.error("Keeper Commander could not run a device setting.")
    api.sync_down(params)
    if not find_shared_folder(params):
        params.current_folder = ""
        cli.do_command(params, 'mkdir --user-folder "%s"' % SHARED_FOLDER)
        api.sync_down(params)
    count = sum(1 for uid in shared_record_uids(params) if login_entry(params, uid))
    return {"folder": SHARED_FOLDER, "loginCount": count}


def op_list(request, holder):
    session = open_stored(request)
    holder.append(session)
    params = session.params
    logins = [entry for entry in (login_entry(params, uid) for uid in sorted(shared_record_uids(params))) if entry]
    return {"logins": logins, "folder": SHARED_FOLDER if find_shared_folder(params) else None}


def op_secret(request, holder):
    session = open_stored(request)
    holder.append(session)
    params = session.params
    uid = request.get("uid")
    if not isinstance(uid, str) or uid not in shared_record_uids(params):
        return {"value": None}
    record = vault.KeeperRecord.load(params, uid)
    if record is None:
        return {"value": None}
    if request.get("kind") == "totp":
        urls = field_values(record, "oneTimeCode")
        code = get_totp_code(urls[0]) if urls else None
        return {"value": code[0] if code else None}
    passwords = field_values(record, "password")
    return {"value": passwords[0] if passwords else None}


def op_logout(request, holder):
    try:
        session = open_stored(request)
    except Failure:
        return {}
    holder.append(session)
    try:
        cli.do_command(session.params, "logout")
    except Exception:
        logging.error("Keeper Commander could not sign out.")
    return {}


OPERATIONS = {"login": op_login, "list": op_list, "secret": op_secret, "logout": op_logout}


def main():
    holder = []
    try:
        request = json.loads(sys.stdin.readline() or "null")
        operation = OPERATIONS.get(request.get("op")) if isinstance(request, dict) else None
        if operation is None:
            raise Failure("failed")
        result = operation(request, holder)
        config = holder[0].config() if holder else None
        if request.get("op") == "logout":
            config = None
        send(dict(result, event="done", config=config))
        return 0
    except Failure as failure:
        config = holder[0].config() if holder else None
        send({"event": "error", "code": failure.code, "config": config})
        return 1
    except Exception:
        logging.error("Keeper Commander failed.", exc_info=False)
        config = holder[0].config() if holder else None
        send({"event": "error", "code": "failed", "config": config})
        return 1
    finally:
        for session in holder:
            try:
                session.close()
            except OSError:
                pass


if __name__ == "__main__":
    sys.exit(main())
`;
