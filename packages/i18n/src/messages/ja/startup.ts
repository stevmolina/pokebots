import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/startup";

export const messages = {
  "startup.failedTitle": "Pokebots を起動できませんでした",
  "startup.failedBody":
    "{message}\n\nお使いのデータは初期化も上書きもされていません。復旧の手順はトラブルシューティングガイドをご覧ください。",
  "startup.archiveChangedTitle": "Pokebots のファイルが変更されました",
  "startup.archiveChangedBody":
    "別のプログラムが Pokebots のファイル app.asar を変更しました。Pokebots は今は動作していますが、終了すると次は起動しません。\n\n修復するには、Pokebots をもう一度インストールしてください。ローカルのデータはそのまま残ります。",
  "startup.archiveChangedDownload": "Pokebots をダウンロード",
  "startup.filesDamagedBody":
    "Pokebots の一部のファイルが破損しているか、見つかりません。\n\n修復するには、Pokebots をもう一度インストールしてください。ローカルのデータはそのまま残ります。",
  "startup.newerDataUpdatingTitle": "Pokebots を更新しています",
  "startup.newerDataUpdatingBody":
    "新しいバージョンの Pokebots がデータを保存しました。Pokebots は最新バージョンをインストールしてから、もう一度開きます。\n\nローカルデータはリセットも上書きもされていません。",
  "startup.newerDataTitle": "最新の Pokebots をインストールしてください",
  "startup.newerDataBody":
    "新しいバージョンの Pokebots がデータを保存したため、このバージョン ({version}) では開けません。データを開くには最新バージョンをインストールしてください。\n\nローカルデータはリセットも上書きもされていません。",
  "startup.newerDataDownload": "Pokebots をダウンロード",
  "startup.newerDataGuide": "ガイドを開く",
  "startup.newerDataQuit": "終了",
  "startup.newerDataLoopTitle": "最新の Pokebots が開きませんでした",
  "startup.newerDataLoopBody":
    "新しいバージョンの Pokebots がデータを保存したため、このバージョン ({version}) では開けません。Pokebots {loopVersion} は開く前に何度も続けて停止したため、再インストールしません。\n\n{loopVersion} より新しいバージョンが公開されたら、それをインストールしてください。サポートが必要な場合は、ガイドを開いてください。\n\nローカルデータはリセットも上書きもされていません。",
  "startup.newerDataReleases": "リリースを表示",
  "startup.recoveryWindowTitle": "Pokebots の復旧",
  "startup.recoveryTitle": "Pokebots を開けませんでした",
  "startup.recoveryBody": {
    other:
      "Pokebots {version} は開く前に {count} 回続けて停止しました。ローカルデータはリセットも上書きもされていません。",
  },
  "startup.recoveryHint":
    "もう一度試すか、最後に開けたバージョンをインストールしてください。サポートが必要な場合は、診断情報を書き出し、そのファイルをレポートと一緒に送ってください。",
  "startup.recoveryHintLatest":
    "データを開ける以前のバージョンが見つかりませんでした。もう一度試すか、最新バージョンをインストールしてください。サポートが必要な場合は、診断情報を書き出し、そのファイルをレポートと一緒に送ってください。",
  "startup.recoveryRetry": "再試行",
  "startup.recoveryPreviousVersion": "前のバージョンをダウンロード",
  "startup.recoveryLatestVersion": "最新バージョンをダウンロード",
  "startup.recoveryExportDiagnostics": "診断情報を書き出す",
  "startup.recoveryOpenDataFolder": "データフォルダを開く",
  "startup.recoveryQuit": "終了",
  "startup.recoveryDiagnosticsSaved": "診断ファイルを保存しました。",
  "startup.recoveryActionFailed": "Pokebots はこの操作を実行できませんでした。",
} as const satisfies PartialTranslation<typeof source>;
