import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/startup";

export const messages = {
  "startup.failedTitle": "O Pokebots não conseguiu iniciar",
  "startup.failedBody":
    "{message}\n\nSeus dados locais não foram redefinidos nem sobrescritos. Consulte o guia de solução de problemas para ver os passos de recuperação.",
  "startup.archiveChangedTitle": "Arquivos do Pokebots foram alterados",
  "startup.archiveChangedBody":
    "Outro programa alterou o arquivo app.asar do Pokebots. O Pokebots funciona agora, mas não vai abrir depois que você fechá-lo.\n\nPara reparar, instale o Pokebots novamente. Seus dados locais são mantidos.",
  "startup.archiveChangedDownload": "Baixar Pokebots",
  "startup.filesDamagedBody":
    "Alguns arquivos do Pokebots estão danificados ou faltando.\n\nPara reparar, instale o Pokebots novamente. Seus dados locais são mantidos.",
  "startup.newerDataUpdatingTitle": "Atualizando o Pokebots",
  "startup.newerDataUpdatingBody":
    "Uma versão mais recente do Pokebots salvou seus dados. O Pokebots instala a versão mais recente e depois abre de novo.\n\nSeus dados locais não foram redefinidos nem substituídos.",
  "startup.newerDataTitle": "Instale o Pokebots mais recente",
  "startup.newerDataBody":
    "Uma versão mais recente do Pokebots salvou seus dados, e esta versão ({version}) não consegue abri-los. Instale a versão mais recente para abrir seus dados.\n\nSeus dados locais não foram redefinidos nem substituídos.",
  "startup.newerDataDownload": "Baixar Pokebots",
  "startup.newerDataGuide": "Abrir guia",
  "startup.newerDataQuit": "Sair",
  "startup.newerDataLoopTitle": "A versão mais recente do Pokebots não abriu",
  "startup.newerDataLoopBody":
    "Uma versão mais recente do Pokebots salvou seus dados, e esta versão ({version}) não consegue abri-los. O Pokebots {loopVersion} parou antes de abrir várias vezes seguidas, então ele não será instalado de novo.\n\nInstale uma versão mais recente que a {loopVersion} quando houver uma disponível. Para obter ajuda, abra o guia.\n\nSeus dados locais não foram redefinidos nem substituídos.",
  "startup.newerDataReleases": "Ver versões",
  "startup.recoveryWindowTitle": "Recuperação do Pokebots",
  "startup.recoveryTitle": "O Pokebots não abriu",
  "startup.recoveryBody": {
    one: "O Pokebots {version} parou antes de abrir, {count} vez seguida. Seus dados locais não foram redefinidos nem substituídos.",
    other:
      "O Pokebots {version} parou antes de abrir, {count} vezes seguidas. Seus dados locais não foram redefinidos nem substituídos.",
  },
  "startup.recoveryHint":
    "Tente novamente ou instale a última versão que abriu. Para obter ajuda, exporte o diagnóstico e envie o arquivo com seu relato.",
  "startup.recoveryHintLatest":
    "O Pokebots não encontrou uma versão anterior que consiga abrir seus dados. Tente novamente ou instale a versão mais recente. Para obter ajuda, exporte o diagnóstico e envie o arquivo com seu relato.",
  "startup.recoveryRetry": "Tentar de novo",
  "startup.recoveryPreviousVersion": "Baixar versão anterior",
  "startup.recoveryLatestVersion": "Baixar versão mais recente",
  "startup.recoveryExportDiagnostics": "Exportar diagnóstico",
  "startup.recoveryOpenDataFolder": "Abrir pasta de dados",
  "startup.recoveryQuit": "Sair",
  "startup.recoveryDiagnosticsSaved": "O arquivo de diagnóstico foi salvo.",
  "startup.recoveryActionFailed": "O Pokebots não conseguiu fazer esta ação.",
} as const satisfies PartialTranslation<typeof source>;
