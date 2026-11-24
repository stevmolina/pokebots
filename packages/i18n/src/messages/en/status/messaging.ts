import { defineMessages } from "../../../message";

export const messages = defineMessages("status.messaging", {
  // Text that OpenBot posts in a Slack conversation. Slack users read it. It names no agent: in
  // Slack, every answer comes from OpenBot.
  "status.messaging.working": "Working on it…",
  // It names no product: WhatsApp posts it from the owner's own number, also in a group.
  "status.messaging.queued": "Waiting for an earlier request to finish. The answer comes here.",
  "status.messaging.busy": "Too many requests are waiting. Try again later.",
  "status.messaging.failed": "Pokebots could not finish this request. The Pokebots host has the details.",
  "status.messaging.noAnswer": "Pokebots finished without a written answer.",
  "status.messaging.noAgent": "No agent can answer here yet. Add the Slack Orchestrator in Pokebots.",
  "status.messaging.delegated": "A teammate is working on it. The answer comes here.",
  "status.messaging.stopped": "Stopped.",
  "status.messaging.stop": "Stop",
  "status.messaging.approvalTitle": "Pokebots asks for approval to continue.",
  "status.messaging.approvalTitleTeammate": "Teammate {agent} asks for approval to continue.",
  "status.messaging.approvalCommand": "Run a command",
  "status.messaging.approvalFileChange": "Change files",
  "status.messaging.approvalPermissions": "Get more permissions",
  "status.messaging.approve": "Approve",
  "status.messaging.deny": "Deny",
  "status.messaging.approvedBy": "Approved by {user}.",
  "status.messaging.deniedBy": "Denied by {user}.",
  "status.messaging.answeredOnHost": "Answered on the Pokebots host.",
  "status.messaging.requestInactive": "This request is no longer active.",
  "status.messaging.onlyRequester": "Only {user} can do this. The Pokebots host can also answer.",
  "status.messaging.hostOnly": "Only the Pokebots host can answer this request.",
  "status.messaging.filesSkipped": "Some files were not sent: {names}.",
  // The name and title of the agent that OpenBot adds to answer in Slack. The user can rename it.
  "status.messaging.orchestratorName": "Slack Orchestrator",
  "status.messaging.orchestratorTitle": "Answers in Slack and asks the team",
  // The same texts for Discord. Discord users read the first one.
  "status.messaging.discordNoAgent": "No agent can answer here yet. Add the Discord Orchestrator in Pokebots.",
  "status.messaging.discordOrchestratorName": "Discord Orchestrator",
  "status.messaging.discordOrchestratorTitle": "Answers in Discord and asks the team",
  // The sidebar section that OpenBot puts the Slack Orchestrator in. The user can rename it.
  "status.messaging.integrationsSection": "Integrations",
  // The page a development Slack install ends on.
  "status.messaging.signInReceived": "Pokebots received the Slack install. You can close this tab.",
  "status.messaging.signInUnknown": "Pokebots did not start this Slack install. Start it again in Pokebots.",
  // Text that OpenBot posts in a Telegram chat, and the Telegram Orchestrator agent. Telegram users
  // read the posts. The user can rename the agent.
  "status.messaging.telegramNoAgent": "No agent can answer here yet. Add the Telegram Orchestrator in Pokebots.",
  "status.messaging.telegramLinked":
    "Pokebots is connected to this chat. Mention {bot} or reply to a message of Pokebots to ask the agents.",
  "status.messaging.telegramOrchestratorName": "Telegram Orchestrator",
  "status.messaging.telegramOrchestratorTitle": "Answers in Telegram and asks the team",
  // Text that OpenBot posts from a linked WhatsApp number, and the WhatsApp Orchestrator agent.
  // WhatsApp users read the posts. Personal WhatsApp has no buttons, so a person answers with a number.
  "status.messaging.whatsappNoAgent": "No agent can answer here yet. Add the WhatsApp Orchestrator in Pokebots.",
  "status.messaging.whatsappApprovalMenu": "Reply 1 to approve or 2 to deny.",
  "status.messaging.whatsappStopMenu": "Reply stop to stop.",
  "status.messaging.whatsappPairingCode":
    "This number answers only people that its owner allowed. Give the owner this code: {code}",
  "status.messaging.whatsappPairingApproved": "You can now send requests to this number.",
  "status.messaging.whatsappOwnChat": "Message yourself",
  // The first message after a link, in the linked number's own "Message yourself" chat.
  "status.messaging.whatsappWelcomeOwn":
    "👋 *Pokebots is connected*\n\nWrite here to ask your agents. The WhatsApp Orchestrator answers, or gives the work to the right agent.\n\nSend *stop* to stop a request.",
  "status.messaging.whatsappWelcomeDedicated":
    "👋 *Pokebots is connected*\n\nThe people you allow in Pokebots can now write to this number. A new person gets a code: approve it in Pokebots under Requests.\n\nSend *stop* to stop a request.",
  // Notices in the owner's own chat when another OpenBot is linked to the same number, or when the
  // chat gets requests too fast, as two OpenBots that answer each other do.
  "status.messaging.whatsappOtherOpenBot":
    "Another Pokebots is linked to this WhatsApp number, so you can get two answers. To fix this, open Linked devices in WhatsApp on your phone and log out the Pokebots that you do not use.",
  "status.messaging.whatsappPaused":
    "Pokebots stopped answering here for 10 minutes: too many messages came in a short time. If another Pokebots is linked to this number, open Linked devices in WhatsApp on your phone and log out the Pokebots that you do not use.",
  "status.messaging.whatsappOrchestratorName": "WhatsApp Orchestrator",
  "status.messaging.whatsappOrchestratorTitle": "Answers in WhatsApp and asks the team",
});
