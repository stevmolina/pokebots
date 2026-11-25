import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/update";

export const messages = {
  "error.update.unsupported": "アップデートはインストール済みのデスクトップ版でご利用いただけます。",
  "error.update.notReady": "インストールできるアップデートがありません。",
  "error.update.restartFailed": "アップデートをインストールするための再起動ができませんでした。",
  "error.update.downloadStalled": "アップデートのダウンロードが応答しなくなりました。もう一度お試しください。",
  "error.update.installFailed":
    "アップデートをインストールできませんでした。Pokebots を終了してから開き直し、もう一度お試しください。",
  "error.update.jobOff": "アップデートはオフです。",
  "error.update.jobStartFailed":
    "アップデートを再びオンにできませんでした。Pokebots のチェックアウトで scripts/custom-auto-update-setup.sh を実行してください。",
  "error.update.notInstalled":
    "前回の再起動ではアップデートがインストールされませんでした。もう一度再起動してお試しください。",
  "error.update.downloadFailed": "アップデートをダウンロードできませんでした。もう一度お試しください。",
  "error.update.checkFailed": "アップデートを確認できませんでした。もう一度お試しください。",
  "error.update.checkStalled": "アップデートの確認が応答しなくなりました。もう一度お試しください。",
  "error.update.checkOffline":
    "アップデートサービスに接続できませんでした。インターネット接続を確認してから、もう一度お試しください。",
  "error.update.checkUnavailable":
    "アップデートサービスから応答がありませんでした。数分後に Pokebots が自動でもう一度試します。",
  "error.update.checkNoRelease":
    "このプラットフォーム向けに公開されたアップデートは見つかりませんでした。数分後に Pokebots が自動でもう一度試します。",
  "error.update.managedByNix": "この Pokebots のアップデートは Nix がインストールします。Nix で更新してください。",
  "error.update.managedByHost":
    "この Mac のアップデートはホストがインストールします。ホストのメンテナンスが実行されるまで、アップデートは準備済みのままです。",
  "error.update.siblingSession":
    "このアプリケーションから別の Pokebots セッションがまだ実行中です。先に他のすべての macOS ユーザーアカウントで Pokebots を終了してから、アップデートをもう一度インストールしてください。",
  "error.update.siblingSessionSameAccount":
    "このユーザーアカウントで別の Pokebots プロセスがまだ実行中です。それを終了してから、もう一度アップデートをインストールしてください。",
  "error.update.siblingCheckFailed":
    "他の Pokebots セッションを確認できませんでした。インストールする前にもう一度お試しください。",
  "error.update.readOnlyLocation":
    "この場所からは Pokebots のアップデートをインストールできません。Pokebots を終了してください。Finder で Pokebots を「アプリケーション」フォルダにドラッグします（すでにそこにある場合は、一度外に出してから戻します）。その後 Pokebots を開き、もう一度アップデートをインストールしてください。",
  "error.update.appImageMissing":
    "AppImage ファイルが移動、名前変更、または置き換えられたため、Pokebots はアップデートをインストールできません。Pokebots を終了してから、AppImage ファイルをもう一度開いてください。",
  "error.update.appImageReadOnly":
    "Pokebots は AppImage ファイルのフォルダにアップデートをインストールできません。Pokebots を終了し、AppImage ファイルをホームフォルダ内のフォルダに移動してから開き、もう一度アップデートをインストールしてください。",
  "error.update.remoteDisabled": "このコンピューターでは、サーバー管理者からのアップデートはオフになっています。",
  "error.update.restartStarted": "Pokebots はアップデートをインストールするため、すでに再起動しています。",
  "error.update.alreadyRestarting": "Pokebots はすでに再起動しています。",
} as const satisfies PartialTranslation<typeof source>;
