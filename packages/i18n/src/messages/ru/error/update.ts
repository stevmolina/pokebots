import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/update";

export const messages = {
  "error.update.unsupported": "Обновления доступны в установленных сборках для компьютера.",
  "error.update.notReady": "Обновление не готово к установке.",
  "error.update.restartFailed": "Pokebots не смог перезапуститься для установки обновления.",
  "error.update.downloadStalled": "Загрузка обновления перестала отвечать. Повторите попытку.",
  "error.update.installFailed":
    "Не удалось установить обновление. Закройте и снова откройте Pokebots, затем повторите попытку.",
  "error.update.notInstalled": "Последний перезапуск не установил обновление. Перезапустите, чтобы повторить попытку.",
  "error.update.downloadFailed": "Не удалось загрузить обновление. Повторите попытку.",
  "error.update.checkFailed": "Не удалось проверить обновления. Повторите попытку.",
  "error.update.checkStalled": "Проверка обновлений перестала отвечать. Повторите попытку.",
  "error.update.checkOffline":
    "Не удалось связаться со службой обновлений. Проверьте подключение к интернету и повторите попытку.",
  "error.update.checkUnavailable":
    "Служба обновлений не ответила. Pokebots сам повторит попытку через несколько минут.",
  "error.update.checkNoRelease":
    "Для этой платформы не найдено опубликованных обновлений. Pokebots сам повторит попытку через несколько минут.",
  "error.update.managedByNix": "Обновления этой копии Pokebots устанавливает Nix. Обновите её через Nix.",
  "error.update.managedByHost":
    "Обновления на этом Mac устанавливает хост. Обновление остаётся готовым до начала обслуживания хоста.",
  "error.update.siblingSession":
    "Из этого приложения всё ещё запущена другая сессия Pokebots. Сначала закройте Pokebots во всех других учётных записях macOS, затем установите обновление снова.",
  "error.update.siblingSessionSameAccount":
    "В этой учётной записи всё ещё работает другой процесс Pokebots. Завершите его, затем установите обновление снова.",
  "error.update.siblingCheckFailed": "Не удалось проверить другие сессии Pokebots. Повторите попытку перед установкой.",
  "error.update.readOnlyLocation":
    "Pokebots не может устанавливать обновления из этого места. Закройте Pokebots. В Finder перетащите Pokebots в папку «Программы» (если он уже там, перетащите его наружу и обратно). Затем откройте Pokebots и установите обновление снова.",
  "error.update.appImageMissing":
    "Pokebots не может установить обновление, потому что его файл AppImage был перемещён, переименован или заменён. Закройте Pokebots, затем снова откройте файл AppImage.",
  "error.update.appImageReadOnly":
    "Pokebots не может устанавливать обновления в папку своего файла AppImage. Закройте Pokebots, переместите файл AppImage в папку внутри домашней папки, затем откройте его и снова установите обновление.",
  "error.update.remoteDisabled": "Обновления от администраторов сервера отключены на этом компьютере.",
  "error.update.restartStarted": "Pokebots уже перезапускается для установки обновления.",
  "error.update.alreadyRestarting": "Pokebots уже перезапускается.",
} as const satisfies PartialTranslation<typeof source>;
