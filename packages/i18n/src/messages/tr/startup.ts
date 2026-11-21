import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/startup";

export const messages = {
  "startup.failedTitle": "Pokebots başlatılamadı",
  "startup.failedBody":
    "{message}\n\nYerel verileriniz sıfırlanmadı veya üzerine yazılmadı. Kurtarma adımları için sorun giderme kılavuzuna bakın.",
  "startup.archiveChangedTitle": "Pokebots dosyaları değiştirildi",
  "startup.archiveChangedBody":
    "Başka bir program Pokebots’un app.asar dosyasını değiştirdi. Pokebots şu an çalışıyor, ancak kapattıktan sonra açılmayacak.\n\nOnarmak için Pokebots’u yeniden yükleyin. Yerel verileriniz korunur.",
  "startup.archiveChangedDownload": "Pokebots’u indir",
  "startup.filesDamagedBody":
    "Bazı Pokebots dosyaları hasarlı veya eksik.\n\nOnarmak için Pokebots’u yeniden yükleyin. Yerel verileriniz korunur.",
  "startup.newerDataUpdatingTitle": "Pokebots güncelleniyor",
  "startup.newerDataUpdatingBody":
    "Pokebots’un daha yeni bir sürümü verilerinizi kaydetti. Pokebots en son sürümü yüklüyor ve ardından yeniden açılacak.\n\nYerel verileriniz sıfırlanmadı veya üzerine yazılmadı.",
  "startup.newerDataTitle": "En son Pokebots’u yükleyin",
  "startup.newerDataBody":
    "Pokebots’un daha yeni bir sürümü verilerinizi kaydetti ve bu sürüm ({version}) onları açamıyor. Verilerinizi açmak için en son sürümü yükleyin.\n\nYerel verileriniz sıfırlanmadı veya üzerine yazılmadı.",
  "startup.newerDataDownload": "Pokebots’u indir",
  "startup.newerDataGuide": "Kılavuzu aç",
  "startup.newerDataQuit": "Çık",
  "startup.newerDataLoopTitle": "En son Pokebots açılmadı",
  "startup.newerDataLoopBody":
    "Pokebots’un daha yeni bir sürümü verilerinizi kaydetti ve bu sürüm ({version}) onları açamıyor. Pokebots {loopVersion} art arda birkaç kez açılmadan durdu, bu yüzden yeniden yüklenmiyor.\n\n{loopVersion} sürümünden daha yeni bir sürüm çıktığında onu yükleyin. Yardım almak için kılavuzu açın.\n\nYerel verileriniz sıfırlanmadı veya üzerine yazılmadı.",
  "startup.newerDataReleases": "Sürümleri göster",
  "startup.recoveryWindowTitle": "Pokebots kurtarma",
  "startup.recoveryTitle": "Pokebots açılmadı",
  "startup.recoveryBody": {
    one: "Pokebots {version}, açılmadan önce art arda {count} kez durdu. Yerel verileriniz sıfırlanmadı veya üzerine yazılmadı.",
    other:
      "Pokebots {version}, açılmadan önce art arda {count} kez durdu. Yerel verileriniz sıfırlanmadı veya üzerine yazılmadı.",
  },
  "startup.recoveryHint":
    "Yeniden deneyin veya açılan son sürümü yükleyin. Yardım almak için tanılamayı dışa aktarın ve dosyayı raporunuzla gönderin.",
  "startup.recoveryHintLatest":
    "Pokebots verilerinizi açabilen daha eski bir sürüm bulamadı. Yeniden deneyin veya en son sürümü yükleyin. Yardım almak için tanılamayı dışa aktarın ve dosyayı raporunuzla gönderin.",
  "startup.recoveryRetry": "Yeniden dene",
  "startup.recoveryPreviousVersion": "Önceki sürümü indir",
  "startup.recoveryLatestVersion": "En son sürümü indir",
  "startup.recoveryExportDiagnostics": "Tanılamayı dışa aktar",
  "startup.recoveryOpenDataFolder": "Veri klasörünü aç",
  "startup.recoveryQuit": "Çık",
  "startup.recoveryDiagnosticsSaved": "Tanılama dosyası kaydedildi.",
  "startup.recoveryActionFailed": "Pokebots bu işlemi yapamadı.",
} as const satisfies PartialTranslation<typeof source>;
