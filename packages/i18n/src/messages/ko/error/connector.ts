import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/connector";

export const messages = {
  // The built-in GitHub connection: the device flow, the token refresh and the stored file.
  "error.connector.githubUnavailable": "이 Pokebots 빌드에는 GitHub App이 없어요.",
  "error.connector.githubDenied": "GitHub 로그인이 거부됐어요.",
  "error.connector.githubCodeExpired": "GitHub 코드가 만료됐어요. GitHub를 다시 연결해 주세요.",
  "error.connector.githubDeviceFlowDisabled": "이 GitHub App은 기기 로그인을 허용하지 않아요.",
  "error.connector.githubClientUnknown": "GitHub가 이 GitHub App의 Client ID를 알지 못해요.",
  "error.connector.githubUnexpected": "GitHub가 예상하지 못한 응답을 보냈어요: {detail}",
  "error.connector.githubUnreachable": "Pokebots이 GitHub에 연결할 수 없어요: {detail}",
  "error.connector.githubExpired": "GitHub 연결이 만료됐어요. GitHub를 다시 연결해 주세요.",
  "error.connector.githubFileUnreadable": "GitHub 연결 파일을 읽을 수 없어요.",
  "error.connector.githubFileTooLarge": "GitHub 연결 파일이 너무 커요.",
  // The 1Password connection: the CLI that creates the service account, the token and the stored file.
  "error.connector.onePasswordCliMissing":
    "Pokebots이 1Password CLI를 찾을 수 없어요. CLI를 설치하고 1Password 앱에서 연동을 켜거나, 서비스 계정 토큰을 사용해 주세요.",
  "error.connector.onePasswordCliInstallFailed":
    "Pokebots이 1Password CLI를 설치하지 못했어요. 인터넷 연결을 확인한 후 다시 시도해 주세요.",
  "error.connector.onePasswordCliSignedOut":
    "1Password CLI에 로그인되어 있지 않아요. 1Password 앱에서 연동을 켠 후 다시 연결해 주세요.",
  "error.connector.onePasswordAppUnreachable":
    "Pokebots이 1Password 앱에 연결할 수 없어요. 1Password를 열고 잠금을 해제하세요. 설정 > 개발자에서 “1Password CLI와 통합”이 켜져 있는지 확인한 후 다시 시도해 주세요.",
  "error.connector.onePasswordCliFailed": "1Password CLI가 실패했어요: {detail}",
  "error.connector.onePasswordCliForbidden":
    "이 1Password 계정으로는 공유 보관함이나 서비스 계정을 만들 수 없어요. 계정 소유자나 관리자에게 이 권한을 요청하거나, 서비스 계정 토큰을 받아 ‘토큰 사용’을 클릭해 주세요.",
  "error.connector.onePasswordUnexpected": "1Password가 예상하지 못한 응답을 보냈어요: {detail}",
  "error.connector.onePasswordTokenRejected": "1Password가 서비스 계정 토큰을 받아들이지 않았어요.",
  "error.connector.onePasswordUnreachable":
    "Pokebots이 1Password에 연결하지 못했어요. 인터넷 연결을 확인한 후 다시 시도해 주세요.",
  "error.connector.onePasswordRateLimited": "1Password에 요청이 너무 많아요. 몇 분 기다린 후 다시 시도해 주세요.",
  "error.connector.onePasswordNoVault":
    "서비스 계정이 볼트를 읽을 수 없어요. 볼트에 대한 접근 권한을 부여한 후 다시 시도해 주세요.",
  "error.connector.onePasswordFileUnreadable": "1Password 연결 파일을 읽을 수 없어요.",
  "error.connector.onePasswordFileTooLarge": "1Password 연결 파일이 너무 커요.",
  "error.connector.bitwardenFailed":
    "Bitwarden을 읽을 수 없어요. bw CLI를 설치하고, 로그인한 후 잠금을 해제하고, Shared with OpenBot이라는 폴더를 하나 만들어 주세요. 새 세션 키로 연결해 주세요.",
  "error.connector.bitwardenCliMissing":
    "Pokebots이 Bitwarden CLI를 찾을 수 없습니다. bw를 설치하고 새 터미널에서 작동하는지 확인한 다음 다시 연결하세요.",
  "error.connector.bitwardenFolderMissing":
    "Bitwarden에는 Shared with OpenBot이라는 폴더가 정확히 하나 있어야 합니다. 폴더를 만들거나 추가 폴더를 삭제한 다음 다시 연결하세요.",
  "error.connector.bitwardenHostInput":
    "HTTPS 서버 주소, API 키의 client_id와 client_secret, 마스터 비밀번호를 입력해 주세요.",
  "error.connector.bitwardenHostFailed":
    "이 서버에서 Bitwarden을 열 수 없어요. 서버 주소, API 키, 마스터 비밀번호를 확인하고 Shared with OpenBot이라는 폴더가 하나 있는지 확인해 주세요. 그런 다음 다시 연결해 주세요.",
  "error.connector.bitwardenCliInstallFailed":
    "이 서버에 Bitwarden CLI를 설치하지 못했어요. 서버의 네트워크 연결을 확인한 후 다시 연결해 주세요.",
  "error.connector.bitwardenFileUnreadable": "Bitwarden 연결 파일을 읽을 수 없어요.",
  "error.connector.passwordManagerUnknown": "Pokebots에서 이 비밀번호 관리자를 지원하지 않습니다.",
  "error.connector.passwordManagerMethod": "이 비밀번호 관리자는 이 방법으로 연결할 수 없습니다.",
  "error.connector.passwordManagerNoSignIn": "열린 로그인 페이지가 없습니다. 다시 연결하세요.",
  "error.connector.protonPassFailed": "Proton Pass를 연결하지 못했습니다. 다시 연결하세요.",
  "error.connector.protonPassCliInstallFailed":
    "Proton Pass CLI를 설치하지 못했습니다. 네트워크 연결을 확인한 후 다시 연결하세요.",
  "error.connector.protonPassPlan":
    "사용 중인 Proton 요금제에서는 Proton Pass CLI를 사용할 수 없습니다. 요금제를 변경한 후 다시 연결하세요.",
  "error.connector.protonPassPlanMissing":
    "사용 중인 Proton 요금제에는 Proton Pass CLI가 포함되지 않습니다. Pass Plus가 포함된 Proton 요금제가 필요합니다. 요금제를 변경한 후 다시 연결하세요.",
  "error.connector.protonPassExpired": "Proton Pass 액세스가 종료되었습니다. 다시 연결하세요.",
  "error.connector.protonPassKeyInvalid": "pst_로 시작하는 Proton Pass 액세스 키를 입력하세요.",
  "error.connector.protonPassExtraPassword": "추가 비밀번호가 올바르지 않습니다. 다시 입력하세요.",
  "error.connector.protonPassExtraPasswordNotAsked": "Proton Pass가 추가 비밀번호를 요청하지 않았습니다.",
  "error.connector.protonPassFileUnreadable": "Proton Pass 연결 파일을 읽을 수 없습니다.",
  "error.connector.protonPassSignInTimeout": "Proton 로그인이 너무 오래 걸렸습니다. 다시 연결하세요.",
  "error.connector.protonPassSetupFailed":
    "Proton Pass에서 Shared with OpenBot 보관함이나 해당 액세스 키를 만들지 못했습니다. 다시 연결하세요.",
  "error.connector.keeperFailed": "Keeper를 연결하지 못했습니다. 다시 연결하세요.",
  "error.connector.keeperCliInstallFailed":
    "Keeper Commander를 설치하지 못했습니다. 네트워크 연결을 확인한 후 다시 연결하세요.",
  "error.connector.keeperPassword": "이메일 또는 마스터 비밀번호가 올바르지 않습니다.",
  "error.connector.keeperCode": "코드가 올바르지 않습니다. 다시 입력하세요.",
  "error.connector.keeperCodeNotAsked": "Keeper가 코드를 요청하지 않았습니다.",
  "error.connector.keeperNotApproved": "Keeper가 아직 이 기기를 승인하지 않았습니다. 승인한 다음 계속을 선택하세요.",
  "error.connector.keeperExpired": "이 컴퓨터의 Keeper 세션이 종료되었습니다. 다시 연결하세요.",
  "error.connector.keeperPlan":
    "Keeper 관리자가 이 계정에서 Keeper Commander를 허용하지 않습니다. 관리자에게 허용을 요청한 다음 다시 연결하세요.",
  "error.connector.keeperSso": "SSO로 로그인하는 Keeper 계정은 아직 연결할 수 없습니다.",
  "error.connector.keeperTwoFactorUnsupported":
    "이 계정의 2단계 인증 방식은 입력한 코드를 받을 수 없습니다. Keeper에서 인증 앱이나 문자 메시지를 추가한 다음 다시 연결하세요.",
  "error.connector.keeperLocked":
    "Keeper가 이 계정 또는 이 기기를 잠갔습니다. Keeper를 열어 잠금을 해제한 다음 다시 연결하세요.",
  "error.connector.keeperThrottled": "Keeper가 다음 로그인 전에 몇 분 기다리라고 요청합니다. 나중에 다시 연결하세요.",
  "error.connector.keeperPersistentLogin":
    'Keeper 관리자가 Pokebots에 필요한 "Stay logged in"을 껐습니다. 허용을 요청한 뒤 다시 연결하세요.',
  "error.connector.keeperSignInTimeout": "Keeper 로그인이 너무 오래 걸렸습니다. 다시 연결하세요.",
  "error.connector.keeperFileUnreadable": "Keeper 연결 파일을 읽을 수 없습니다.",
} as const satisfies PartialTranslation<typeof source>;
