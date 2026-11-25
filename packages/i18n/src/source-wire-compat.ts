import type { PartialTranslation } from "./message";
import type { source } from "./messages/en/source";

// English wire values from before PR #335 (c5e850e77^). Keep them while supported peers read them.
export const releasedSourceMessages = {
  "error.agent.compactionLoopStopped":
    "{provider} compacted the context again and again, and each time it stayed too full to continue, so OpenBot stopped this turn. Turn off the MCP servers or computer use that this agent does not need, then send a message. If you or the agent changed when {provider} compacts, undo that change.",
  "error.agent.copyNameFailed": "OpenBot could not create a unique agent copy name.",
  "error.agent.deleteFolderInUse":
    "Work of another agent still uses this agent's folder. Delete this agent again when that work ends, or after you restart OpenBot.",
  "error.agent.instructionsOutside":
    "The instructions file links to a place outside the agent's workspace, so OpenBot does not open it.",
  "error.agent.mcpServerBuiltIn":
    "{name} is part of OpenBot, so the MCP tools cannot test, turn on or off, or remove it. The user controls it on the computer that runs OpenBot: the GitHub connection in Marketplace, Apps, GitHub, and Computer Use in Settings, Computer Use.",
  "error.agent.oldRoleField": "Stored agent profiles use the old role field; update the data before starting OpenBot.",
  "error.agent.screenCapturePermissionMissing":
    "OpenBot does not have the Screen Recording permission. Ask the user to open System Settings > Privacy & Security > Screen & System Audio Recording, turn on OpenBot, then quit and open OpenBot again.",
  "error.agent.stateCorrupt": "Agent state is corrupt or from a newer OpenBot version; refusing to overwrite it.",
  "error.agent.storedProfileUnreadable":
    'A stored agent profile has an unreadable "{field}" value; update the data before starting OpenBot.',
  "error.agent.storedProfileUnreadableId":
    'Stored agent profile {id} has an unreadable "{field}" value; update the data before starting OpenBot.',
  "error.agent.toolDescribeUnknownNames":
    "tool_describe found no OpenBot tool named {names}. It describes only the OpenBot and browser tools that openbot.tool_search lists, not MCP tools.",
  "error.agent.toolLoopStopped":
    "{provider} repeated a failed step many times, so OpenBot stopped this turn. Send the message again, or choose another model.",
  "error.agent.turnStalled":
    "{provider} stopped responding, so OpenBot ended this turn. Send the message again, or choose another model.",
  "error.agent.workspaceOnlyToolMissing":
    "Workspace only needs {tool}, which OpenBot did not find. Install it, or choose Full access in the agent settings.",
  "error.app.notReady": "OpenBot is not ready.",
  "error.attachment.emlUnsupported":
    "This server does not support EML attachments. Update OpenBot on the host and retry.",
  "error.attachment.mediaUnsupported":
    "This server does not support MP3 or MOV attachments. Update OpenBot on the host and retry.",
  "error.attachment.mp4Unsupported":
    "This server does not support MP4 attachments. Update OpenBot on the host and retry.",
  "error.attachment.svgUnsupported":
    "This server does not support SVG attachments. Update OpenBot on the host and retry.",
  "error.attachment.zipUnsupported":
    "This server does not support ZIP attachments. Update OpenBot on the host and retry.",
  "error.auth.codeNotSent": "OpenBot could not send the sign-in code.",
  "error.auth.companySignInTokenInvalid": "The provider gave a sign-in that OpenBot cannot check.",
  "error.auth.companySignInUnavailable": "This OpenBot cannot open a browser for the company sign-in.",
  "error.auth.deliveryInterrupted":
    "The connection ended before OpenBot confirmed delivery. Check delivery to avoid sending another code.",
  "error.auth.deliveryTimeout":
    "OpenBot could not confirm delivery in time. The code may still arrive; check delivery before sending again.",
  "error.auth.deliveryUnknown":
    "OpenBot could not confirm whether the sign-in code was sent. Check delivery before sending again.",
  "error.auth.networkBlocked":
    "A firewall or proxy on this network blocked OpenBot from reaching {host}. Ask your network administrator to allow {host}, then try again.",
  "error.auth.serviceUnavailable":
    "OpenBot could not reach the account service. Check that the API is running, then try again.",
  "error.auth.serviceUnreachable":
    "OpenBot could not reach the account service. Check your connection, then try again.",
  "error.auth.signInFirst": "Sign in to OpenBot first.",
  "error.auth.workosSignInTokenInvalid": "OpenBot could not verify the sign-in.",
  "error.backend.apiKeySaveFailed": "OpenBot could not save the API key. Try again.",
  "error.backend.attachmentCopyFailed": "OpenBot could not copy {name}.",
  "error.backend.browserSignInOpenFailed": "OpenBot could not open the sign-in window.",
  "error.backend.browserSignInReadFailed": "OpenBot could not read the sign-in from the window.",
  "error.backend.browserSystemProxyFailed":
    "The proxy in the settings of the computer that runs OpenBot does not answer or refused the connection, so the page did not open. Check the proxy settings of that computer.",
  "error.backend.codingJobResumeFailed": "OpenBot could not resume this coding job with the original account.",
  "error.backend.contextCompactionIneffective":
    "Compaction does not make this chat smaller: after two compactions it still uses {percent}% of the model's context window, so OpenBot stops compacting it. Tools and instructions use most of the window. Turn off the MCP servers or computer use that this agent does not need, or select a model with a larger window. Then start a new chat.",
  "error.backend.contextCompactionStopped":
    "Two compactions of this chat failed in a row, so OpenBot stops compacting it automatically. Each try sends the whole chat to the model and uses your plan limit. Select Compact now to try again, or start a new chat.",
  "error.backend.databaseIntegrity": "OpenBot database failed its integrity check.",
  "error.backend.feedbackNeedsPhone":
    "Only the OpenBot phone app can send this report, because it adds the phone's version and support log. Open this chat on the phone. If you see this message there, update the phone app.",
  "error.backend.interruptNoSession":
    "OpenBot cannot interrupt this agent because its provider session is unavailable.",
  "error.backend.mailboxStateCorrupt":
    "Mailbox state is corrupt or from a newer OpenBot version; refusing to overwrite it.",
  "error.backend.mcpOAuthProxyUnavailable":
    "OpenBot could not start its local sign-in connection for this server. Restart OpenBot, then try again.",
  "error.backend.mcpOAuthRenewalFailed":
    "OpenBot could not renew the sign-in to this MCP server now. The sign-in is kept, and the next request tries again. If this error continues, the user can sign out of the server in OpenBot and sign in again.",
  "error.backend.mcpOAuthRequestRefused":
    "The MCP server refused this request, but the sign-in to it is still active. Possibly the account cannot use this tool, or the sign-in did not give all the necessary access. The user can examine the plan and the access of the account at the service, or sign in to the server again in OpenBot and allow all the access that it asks for.",
  "error.backend.mcpOAuthSignInNeeded":
    "The sign-in to this MCP server has ended. The user must sign in to it again in OpenBot.",
  "error.backend.mcpRegistrationRefused":
    "The sign-in server does not accept OpenBot as an app yet. Your account is not the cause. Use another way to connect, such as a local MCP server.",
  "error.backend.mcpRegistrationUnavailable":
    "The sign-in server cannot register OpenBot as an app. Your account is not the cause. To connect, save this server in Marketplace, Apps, then add a sign-in app to it.",
  "error.backend.mcpRemoteBridge":
    "{reason} This command runs the mcp-remote bridge. Choose Streamable HTTP with the URL {url} instead, and OpenBot signs you in.",
  "error.backend.mcpRequestDeclined":
    "An MCP server asked for something that OpenBot cannot show, so OpenBot declined it.",
  "error.backend.mcpServerFailedInProvider":
    "{provider} could not start the MCP server {name}. Its tools are not available to {provider}. {provider} starts the server itself, so the connection test in OpenBot can pass. Start a new chat to try again.",
  "error.backend.mcpServerInvalid": "OpenBot cannot save this MCP server configuration.",
  "error.backend.mcpServerLimit": "OpenBot keeps up to {limit} MCP servers.",
  "error.backend.mcpServerRequestDeclined":
    "The MCP server {name} asked for something that OpenBot cannot show, so OpenBot declined it.",
  "error.backend.mcpServerSignInPage":
    "The MCP server {name} asked you to sign in on a web page. OpenBot does not open this page for a server, so it declined. Open {name} in Marketplace, Apps, and sign in, then ask the agent again.",
  "error.backend.mcpServerUnreachable": "OpenBot could not reach the server. Check the URL and your network.",
  "error.backend.mcpSignInAnswerUnreadable":
    "The sign-in server sent an answer that OpenBot cannot read. If the service gives you an API key or a token, add it to the settings of this server, then test the connection again.",
  "error.backend.mcpSignInAppIssuerChanged":
    "The sign-in server of this MCP server changed, so OpenBot did not send it the sign-in app. If the change is correct, remove the sign-in app and add it again.",
  "error.backend.mcpSignInClientRefused":
    "The sign-in server did not accept OpenBot when it completed the sign-in. Sign in again: OpenBot registers with the server again.",
  "error.backend.mcpSignInMetadataUnreadable":
    "OpenBot could not read the sign-in information of this server. Check the server address and try again.",
  "error.backend.mcpSignInNeedsHttps":
    "This server asks for a sign-in, and OpenBot signs in only over https. Change the URL to {url}.",
  "error.backend.mcpSignInOnHost": "This server asks for a sign-in. Sign in to it in OpenBot on the host computer.",
  "error.backend.moonlightWebNotEmbedded": "Moonlight Web is not an OpenBot embedded build.",
  "error.backend.providerRetryingLargeContext":
    "The provider failed this request {attempts} times and tries again. This chat uses {percent}% of the model's context window. If the agent does not continue, stop the turn: OpenBot then compacts the chat before the next message.",
  "error.backend.routineRunNoSession":
    "OpenBot cannot interrupt the active routine run because its provider session is unavailable.",
  "error.backend.shuttingDown": "OpenBot is shutting down.",
  "error.backend.taskStartFailed": "OpenBot could not start the task. Do the work in this turn instead.",
  "error.backend.windowTemporarilyUnavailable": "The OpenBot window is temporarily unavailable.",
  "error.backend.windowUnavailable": "The OpenBot window is unavailable.",
  "error.billing.countryRequired":
    "Give your billing country before you pay. Update OpenBot to do this, then try again.",
  "error.computerUse.noAppToDrag": "This build of OpenBot has no application to drag.",
  "error.computerUse.noAppToShow": "This build of OpenBot has no application to show.",
  "error.connector.agentComputerUnexpected": "Agent Computer sent an answer that OpenBot cannot read.",
  "error.connector.agentComputerUnreachable": "OpenBot cannot reach Agent Computer. Check the network and try again.",
  "error.connector.bitwardenCliMissing":
    "OpenBot cannot find the Bitwarden CLI. Install bw, make sure that it works in a new terminal, then connect again.",
  "error.connector.githubUnavailable": "This build of OpenBot has no GitHub App.",
  "error.connector.githubUnreachable": "OpenBot cannot reach GitHub: {detail}",
  "error.connector.keeperPersistentLogin":
    'Your Keeper administrator turned off "Stay logged in", which OpenBot needs. Ask them to allow it, then connect again.',
  "error.connector.linkUnreachable": "OpenBot cannot reach Link: {detail}",
  "error.connector.onePasswordAppUnreachable":
    "OpenBot cannot reach the 1Password app. Open 1Password and unlock it. In Settings > Developer, make sure that “Integrate with 1Password CLI” is on. Then try again.",
  "error.connector.onePasswordCliInstallFailed":
    "OpenBot could not install the 1Password CLI. Check the connection to the internet, then try again.",
  "error.connector.onePasswordCliMissing":
    "OpenBot cannot find the 1Password CLI. Install it and turn on its integration in the 1Password app, or use a service account token.",
  "error.connector.onePasswordUnreachable":
    "OpenBot cannot reach 1Password. Check the internet connection, then try again.",
  "error.connector.passwordManagerUnknown": "OpenBot does not know this password manager.",
  "error.crm.serverTooOld": "This server does not support the CRM. Update OpenBot on the computer that runs it.",
  "error.crm.settingsSaveFailed": "OpenBot cannot save the CRM setting on this server.",
  "error.crm.sourceFailed": "Stripe sent an answer that OpenBot cannot read. Try again later.",
  "error.crm.sourceKeySaveFailed": "OpenBot cannot save the Stripe key on this computer.",
  "error.crm.sourceNetwork": "OpenBot cannot connect to Stripe. Check the internet connection.",
  "error.host.mobileConnectPublishFailed": "This OpenBot could not be published for Mobile Connect.",
  "error.host.nameBeforePublish": "Name this OpenBot before publishing it.",
  "error.host.publishBeforeInvite": "Make this OpenBot public before creating an invite.",
  "error.host.publishFailed": "This OpenBot could not be published.",
  "error.import.hermesLinkNotSaved":
    "{name}: OpenBot could not save which agent came from this profile, so the next import adds it as a new agent.",
  "error.import.newerExportSkill": "This export was made by a newer export skill. Update OpenBot and try again.",
  "error.import.notAgentExport": "{manifest} is not an OpenBot agent export.",
  "error.import.remoteZipTooLargeOldHost":
    "This server accepts an export of up to 100 MB. Update OpenBot on the server to import a larger export.",
  "error.import.transferNewer": "A newer version of OpenBot made this file. Update OpenBot and try again.",
  "error.import.transferNotFile": "This file is not an OpenBot transfer file.",
  "error.kind.filePermission":
    "OpenBot does not have permission to complete this action. Check the file or folder permissions, then try again.",
  "error.kind.storage":
    "There is not enough storage space. Free some space on the computer running OpenBot, then try again.",
  "error.mcp.redirectNotSaved": "The sign-in did not finish. Go back to OpenBot to see why.",
  "error.mcp.redirectRefused": "The sign-in was refused. Go back to OpenBot and try again.",
  "error.mcp.redirectRelayed": "OpenBot sent the sign-in to the server. You can close this window.",
  "error.mcp.redirectSignedIn": "OpenBot is signed in. You can close this window.",
  "error.mcp.relayNoState":
    "The server's sign-in page does not protect its return address, so OpenBot does not open it on this computer.",
  "error.mcp.signInAppUnsupported": "This server does not support sign-in apps. Update OpenBot on the host.",
  "error.mcp.signInOnHost": "Sign-in to an MCP server works only in OpenBot on the host computer.",
  "error.messaging.discordRelayUnavailable":
    "OpenBot cannot receive Discord events on this computer. Sign in, give this computer a name, and try again.",
  "error.messaging.discordRolesUnsupported": "OpenBot cannot list Discord roles yet. Try again later.",
  "error.messaging.relayUnavailable":
    "OpenBot cannot receive Slack events on this computer. Sign in, give this computer a name, and try again.",
  "error.messaging.telegramRelayUnavailable":
    "OpenBot cannot reach Telegram on this computer. Sign in, give this computer a name, and try again.",
  "error.messaging.telegramRelayUnreachable":
    "OpenBot cannot connect to its service from this computer. Check the internet connection, VPN, proxy, or firewall, and try again.",
  "error.messaging.telegramServiceUnavailable": "OpenBot cannot connect Telegram now. Try again later.",
  "error.provider.accountKeyUnreachable":
    "OpenBot could not reach {provider} to check the API key. Check the internet connection, then try again.",
  "error.provider.accountNeedsKey":
    "A {provider} account after the first uses an API key. Update OpenBot on this device, then try again.",
  "error.provider.accountsReadOnly":
    "The saved provider accounts cannot be read. Update OpenBot before you change them.",
  "error.provider.acpMcpNotLoaded":
    "{provider} did not load OpenBot's tools, so this agent cannot use them or reach its teammates. A {provider} team policy can block local MCP servers. Ask your team admin to allow them, then try again.",
  "error.provider.acpNoModels": "ACP CLI did not advertise any ACP models. OpenBot will not guess a fallback model.",
  "error.provider.acpOwnMcpServerFailed":
    "{provider} could not start the MCP server {name}, so the reply stopped. This server is in your own {provider} settings, not in OpenBot. Remove the server there or repair it, then start a new chat.",
  "error.provider.acpRefusedUntilRestart":
    "{provider} refused a message, so OpenBot ended its process. Send your message again.",
  "error.provider.acpServerLostEnded": "{provider} lost its connection, so OpenBot ended its process.",
  "error.provider.acpSignInLost": "{provider} lost its sign-in, so OpenBot ended its process. Send your message again.",
  "error.provider.acpSignInNetwork":
    "The sign-in could not reach the provider's server. Check the network connection and the DNS settings of the computer that runs OpenBot, then try again.",
  "error.provider.acpUnresponsive": "{provider} did not answer in time, so OpenBot ended its process.",
  "error.provider.antigravityHistoryUnreadable":
    "Gemini could not read the saved history of this chat. OpenBot started a new Gemini session with the chat history. Send your message again.",
  "error.provider.antigravityMissing": "Gemini is not downloaded. Download it in OpenBot to continue.",
  "error.provider.antigravityOverrideInvalid":
    "The Gemini server in OPENBOT_ANTIGRAVITY_PATH is missing or is not executable. Correct the path or remove the variable, then restart OpenBot.",
  "error.provider.antigravitySessionRejected":
    "Gemini refused this request and did not give the cause. An item in the chat history can cause this, such as an image that the agent opened. OpenBot started a new Gemini session with the chat history. Try again. If the error continues, choose another model.",
  "error.provider.blankHistoryText":
    "The model did not accept this chat, because its saved history has an empty message. OpenBot started a new {provider} session with the chat history. Try again.",
  "error.provider.chatgptPageFailed": "OpenBot could not open the ChatGPT connection page.",
  "error.provider.claudeContextFull":
    "This chat became too long for Claude. OpenBot started a new Claude Code session with the chat history. Try again.",
  "error.provider.claudeLoginNotSaved":
    "Claude could not save its sign-in on the Mac. Restart the Mac that runs OpenBot, then connect Claude again.",
  "error.provider.claudeManagedNotStarted":
    "Claude was downloaded but could not be started. Download it again in OpenBot.",
  "error.provider.claudeMissing": "Claude is not downloaded. Download it in OpenBot to continue.",
  "error.provider.claudeOutdated": "Claude Code {version} is too old. OpenBot requires 2.1.232 or newer.",
  "error.provider.claudeSessionMissing":
    "Claude Code could not find the saved session of this chat. OpenBot started a new Claude Code session with the chat history. Try again.",
  "error.provider.cliActivateFailed": "OpenBot could not activate the managed CLI.",
  "error.provider.cliOverride": "Remove the explicit CLI path override before updating in OpenBot.",
  "error.provider.cliSelectFailed": "OpenBot could not select the installed managed CLI.",
  "error.provider.cliTimedOut": "{provider} did not answer in time. The computer may be busy. OpenBot will try again.",
  "error.provider.cliUpdateFailed": "OpenBot could not update the {provider} CLI. {reason}",
  "error.provider.clineMissing": "Cline is not downloaded. Download it in OpenBot to continue.",
  "error.provider.clineOutdated": "Cline CLI {version} is too old. OpenBot requires 3.0.68 or newer.",
  "error.provider.closing": "OpenBot is closing.",
  "error.provider.codexAudioRefused":
    "The model did not accept audio in this chat. OpenBot started a new Codex session with the chat history. Try again.",
  "error.provider.codexHistoryItemMissing":
    "Codex could not continue this chat, because an item in its saved history is missing. OpenBot started a new Codex session with the chat history. Try again.",
  "error.provider.codexManagedNotStarted":
    "ChatGPT was downloaded but could not be started. Download it again in OpenBot.",
  "error.provider.codexMissing": "ChatGPT is not downloaded. Download it in OpenBot to continue.",
  "error.provider.codexOutdated": "Codex CLI {version} is too old. OpenBot requires 0.156.0 or newer.",
  "error.provider.codexRequestRefused":
    "{provider} refused the request for this chat and did not give the cause. This can occur in a long chat with many images. OpenBot started a new {provider} session with the chat history. Try again.",
  "error.provider.codexUnresponsive": "Codex stopped answering, so OpenBot ended its process.",
  "error.provider.computerUseConfig":
    "OpenBot could not register Computer Use in the Codex configuration. Check that your Codex config.toml is valid and writable, then restart OpenBot. You can turn off Computer Use in the teammate settings to continue without it.",
  "error.provider.cursorMissing": "Cursor is not downloaded. Download it in OpenBot to continue.",
  "error.provider.customAgentNotFound": "OpenBot cannot find {command}. Enter the full path of the command.",
  "error.provider.customAgentProtocolVersion": "The agent uses ACP version {version}. OpenBot uses version 1.",
  "error.provider.customAgentsReadOnly":
    "The saved custom agents were written by a newer version of OpenBot, or the file cannot be read. Update OpenBot to change them.",
  "error.provider.customAgentsUnavailable": "This server cannot change its custom agents. Update OpenBot on it.",
  "error.provider.detectionSettingsReadOnly":
    "The detection settings were written by a newer version of OpenBot, or the file cannot be read. Update OpenBot to change them.",
  "error.provider.discoveryUnreachable": "OpenBot could not connect to {host}.",
  "error.provider.endpointsReadOnly":
    "The saved endpoints were written by a newer version of OpenBot, or the file cannot be read. Update OpenBot to change them.",
  "error.provider.environmentNameReserved": "OpenBot sets {name} for this provider. Remove this variable.",
  "error.provider.foreignReasoning":
    "{provider} did not accept the earlier reasoning in this chat, because a different account or API key received it. OpenBot started a new {provider} session with the chat history. Try again.",
  "error.provider.geminiSettingsUnreadable":
    "Gemini cannot open its settings file on this computer, so it cannot sign in. Quit the other apps that use Gemini, then quit and open OpenBot again.",
  "error.provider.grokMissing": "Grok is not downloaded. Download it in OpenBot to continue.",
  "error.provider.grokOutdated": "Grok CLI {version} is too old. OpenBot requires 1.0.5 or newer.",
  "error.provider.hermesRefused":
    "Hermes refused this message before it started. Send it again. If Hermes refuses each message, restart OpenBot on the computer that runs this agent.",
  "error.provider.imageCountLimit":
    "The model did not accept this chat because the chat has too many images. OpenBot started a new {provider} session with the chat history. Try again.",
  "error.provider.imageTooLarge":
    "The model did not accept an image in this chat because the image is too large. OpenBot started a new {provider} session with the chat history. Try again.",
  "error.provider.imageTooSmall":
    "The model did not accept an image in this chat because the image is too small. OpenBot started a new {provider} session with the chat history. Try again.",
  "error.provider.imageUnreadable":
    "The model could not read an image in this chat. OpenBot started a new {provider} session with the chat history. Try again. If you sent an image, send a different one.",
  "error.provider.kimiMissing": "Kimi is not downloaded. Download it in OpenBot to continue.",
  "error.provider.kimiOutdated": "Kimi CLI {version} is too old. OpenBot requires 1.52.0 or newer.",
  "error.provider.mcpConfig":
    "OpenBot could not register MCP servers in the Codex configuration. Check that your Codex config.toml is valid and writable, then restart OpenBot.",
  "error.provider.messageTooLarge": "OpenBot stopped {provider} because it sent a message larger than {limit} MB.",
  "error.provider.museInvalidToolResult": "Invalid OpenBot tool result.",
  "error.provider.museMcpStartupFault":
    "Muse could not start an MCP server and blocked MCP in this session. OpenBot started a new Muse session with the chat history. Try again. If the error continues, turn off Computer Use or the failed MCP server for this agent.",
  "error.provider.off": "{provider} is off in OpenBot. Turn it on in provider settings first.",
  "error.provider.opencodeCompactionFailed":
    "The model could not summarize this long chat to make room in its context window. OpenBot started a new OpenCode session with the chat history. Try again. If the error continues, select a stronger model.",
  "error.provider.opencodeContextTooSmall":
    "This chat does not fit in the model's context window. In Ollama or LM Studio, load the model with a larger context length, and enter the same window in its OpenBot provider settings. Or choose a larger model.",
  "error.provider.opencodeMissing": "OpenCode is not downloaded. Download it in OpenBot to continue.",
  "error.provider.opencodeNetwork":
    "OpenCode could not connect to the model provider. Check the network connection of the computer that runs OpenBot, then try again.\n{detail}",
  "error.provider.opencodeOutOfMemory":
    "The model server ran out of memory for this chat. Start a new chat, or load the model with a smaller context length and enter the same window in its OpenBot provider settings.",
  "error.provider.opencodeSessionRejected":
    "OpenCode refused the request and did not give the cause. This can occur in a long chat or after a model change. OpenBot started a new OpenCode session with the chat history. Try again. If the error continues, select a different model or a lower effort.",
  "error.provider.opencodeUnreadableContent":
    "This model cannot read a file or image in this chat. OpenBot started a new OpenCode session with the chat history. Send your message again without the file, or choose a model that can read files. If you added this model to a custom provider, clear Images at Accepts in its settings.",
  "error.provider.realtimeLimitZero":
    "Linux stopped the provider because OpenBot has a real-time CPU limit of 0. The limit comes from your system. Install and start rtkit (`rtkit-daemon`), run `systemctl --user restart xdg-desktop-portal`, then restart OpenBot. Restarting xdg-desktop-portal alone does not help while rtkit is missing.",
  "error.provider.releaseSourcesUnreachable":
    "OpenBot could not reach the provider release sources. Check the connection and try again.",
  "error.provider.requestFailed": "OpenBot could not download {url}. {reason}",
  "error.provider.requestTooLarge":
    "This chat became too large to send to the model. Images in the chat often cause this. OpenBot started a new {provider} session with the chat history. Try again.",
  "error.provider.serviceUnreachable":
    "{provider} cannot connect to its service. Check your internet connection. OpenBot will try again.",
  "error.provider.sessionStartTimedOut":
    "{provider} did not open a new chat in time, so this message did not start. On the computer that runs OpenBot, open Providers, select {provider} and click Restart. Then try again.",
  "error.provider.signOutUnsupported": "OpenBot cannot disconnect the {provider} sign-in.",
  "error.provider.startPaused":
    "{provider} did not start several times in a row. OpenBot tries again with the next message or routine. To try now, refresh the providers.",
  "error.provider.startStopped":
    "{provider} did not start several times in a row, so OpenBot stopped trying. Refresh the providers to try again.",
  "error.provider.useChangeFailed": "OpenBot could not change the provider setting.",
  "error.provider.useSettingsReadOnly":
    "The saved provider settings cannot be read. Update OpenBot before you change them.",
  "error.remote.appUpdateRequired": "Update this OpenBot app before connecting to the host.",
  "error.remote.connectionNotStarted":
    "OpenBot could not start the connection to this server. If this continues, quit OpenBot and open it again.",
  "error.remote.desktopSetupHostUpdate": "Update OpenBot on the host to check remote desktop setup.",
  "error.remote.desktopTestHostUpdate": "Update OpenBot on the host to test remote desktop setup.",
  "error.remote.directoryTimeout": "The OpenBot service did not answer in time. Try again.",
  "error.remote.directoryUnreachable": "OpenBot could not reach the OpenBot service. Check your connection.",
  "error.remote.hostKeyMissing":
    "OpenBot cannot verify this server because its security key is missing or changed. Ask the server owner to check the server.",
  "error.remote.hostNotRegistered": "This host is no longer registered with the OpenBot service.",
  "error.remote.inviteOtherService": "This invitation belongs to another OpenBot service.",
  "error.remote.localServerNotStarted":
    "The server on this computer did not start. Try again. If it does not start, restart OpenBot on this computer.",
  "error.remote.localServersReadOnly":
    "This version of OpenBot cannot read the list of servers on this computer. Update OpenBot.",
  "error.remote.pairingFailed":
    "Moonlight could not pair with Sunshine on the host. Try again. If the problem continues, restart OpenBot on the host.",
  "error.remote.remoteNotConfigured": "Remote connections are not set up on this OpenBot service.",
  "error.remote.runtimeMissing":
    "The Sunshine and Moonlight Web runtime is missing or is not supported on this host. Install the full OpenBot release on a Mac, a Windows x64 host or a Linux x64 host, then restart OpenBot.",
  "error.remote.screenRecordingDenied":
    "The host has not allowed OpenBot to record its screen. Grant screen recording on the host, then try again.",
  "error.remote.serverNotLoaded": "OpenBot could not load the server. Try again.",
  "error.remote.serviceRequestFailed": "The OpenBot service request failed.",
  "error.remote.signalProtocolError":
    "Signal and this app do not agree on the connection protocol. Update OpenBot, then try again.",
  "error.remote.signalRateLimited": "Too many connection attempts. OpenBot tries again in {seconds} seconds.",
  "error.skill.githubNotFound": "OpenBot cannot open {repository}. The repository is private, or it does not exist.",
  "error.skill.githubRateLimited":
    "GitHub limits how often OpenBot can read it without an account. Try again in one hour.",
  "error.skill.githubTooLarge": "OpenBot cannot read all files of {repository}. The repository is too large.",
  "error.skill.githubUnavailable": "OpenBot cannot read GitHub now. Try again later.",
  "error.skill.managedSlug": "OpenBot gives every agent its own {slug} skill. Give this skill a different name.",
  "error.storage.unreadableFile": "OpenBot cannot read {path}. The file is damaged.",
  "error.team.accountNotMember": "This OpenBot account is not a member of the team.",
  "error.team.agentNotificationLevelsUnsupported":
    "This server cannot keep your own notification level for each agent. Update OpenBot on the computer that runs it.",
  "error.team.clientUpdateRequired": "Update this OpenBot client before connecting to this host.",
  "error.team.connectorPageRefused": "The server sent a page that OpenBot does not open.",
  "error.team.connectorsUnsupported":
    "This server cannot manage its connections from here. Update OpenBot on the host.",
  "error.team.discordAccessUnsupported": "This server cannot set Discord roles. Update OpenBot on it.",
  "error.team.hostUpdateRequired": "Update OpenBot on the host before connecting.",
  "error.team.hostedSitesUnregistered": "This server is not registered with OpenBot, so it has no sites.",
  "error.team.inviteRequiresAccount": "This invitation requires a verified OpenBot account.",
  "error.team.liveVoiceUnsupported":
    "This server does not support Codex live voice. Update OpenBot on the computer that runs it.",
  "error.team.mcpServerListNeedsUpdate":
    "Update OpenBot on this device to use more than {limit} MCP servers on this server.",
  "error.team.notConfigured": "This OpenBot has not been configured.",
  "error.team.ownerEmailRequired": "Sign in with the OpenBot email that created this host.",
  "error.team.ownerNotLinked": "This host is not linked to an OpenBot owner account.",
  "error.team.providerNotManaged": "OpenBot does not manage this provider's CLI.",
  "error.team.routineFlowsUnsupported":
    "This server does not support routine flows. Update OpenBot on the computer that runs it.",
  "error.team.serverSafeMode": "This server is in safe mode because OpenBot on it does not start.",
  "error.team.serverSafeModeNewerDatabase":
    "OpenBot {version} on this server cannot open its data, because a newer OpenBot version saved it. A newer OpenBot release on the server fixes this.",
  "error.team.serverSafeModeStartFailed":
    "OpenBot {version} on this server stopped after it failed to start many times. A newer OpenBot release on the server fixes this.",
  "error.team.sidebarPinsUnsupported":
    "This server cannot keep your pinned chats for all of your devices. Update OpenBot on the computer that runs it.",
  "error.team.signInRelayUnsupported": "This server cannot relay sign-ins. Update OpenBot on the host.",
  "error.team.signInRequired": "OpenBot sign-in is required.",
  "error.team.vaultUnsupported": "This server cannot open its Vault from here. Update OpenBot on the host.",
  "error.update.alreadyRestarting": "OpenBot is already restarting.",
  "error.update.appImageMissing":
    "OpenBot cannot install the update because its AppImage file was moved, renamed or replaced. Quit OpenBot, then open the AppImage file again.",
  "error.update.appImageReadOnly":
    "OpenBot cannot install updates in the folder of its AppImage file. Quit OpenBot, move the AppImage file to a folder in your home folder, then open it and install the update again.",
  "error.update.checkNoRelease":
    "No published update was found for this platform. OpenBot tries again on its own in a few minutes.",
  "error.update.checkUnavailable":
    "The update service did not answer. OpenBot tries again on its own in a few minutes.",
  "error.update.installFailed": "Could not install the update. Quit and reopen OpenBot, then try again.",
  "error.update.managedByNix": "Nix installs updates for this copy of OpenBot. Update it with Nix.",
  "error.update.readOnlyLocation":
    "OpenBot cannot install updates from this location. Quit OpenBot. In Finder, drag OpenBot into the Applications folder (if it is already there, drag it out and back in). Then open OpenBot and install the update again.",
  "error.update.restartFailed": "OpenBot could not restart to install the update.",
  "error.update.restartStarted": "OpenBot is already restarting to install the update.",
  "error.update.siblingCheckFailed": "Could not verify other OpenBot sessions. Try again before installing.",
  "error.update.siblingSession":
    "Another OpenBot session is still running from this application. Stop OpenBot in every other macOS user account first, then install the update again.",
  "error.update.siblingSessionSameAccount":
    "Another OpenBot process is still running in this user account. Quit it, then install the update again.",
  "error.voice.prepareRequired":
    "Local voice transcription is unavailable. Run `bun run voice:prepare` and restart OpenBot.",
  "error.voice.recordingNotKept": "OpenBot could not keep the voice recording.",
  "error.voice.server.invalidAudio": "{host} sent audio that OpenBot cannot play. Use a server that sends WAV.",
  "error.voice.speech.failed": "OpenBot could not read the reply aloud.",
  "error.voice.transcriptionFailed": "OpenBot could not transcribe this recording.",
  "error.workflow.githubUnreachable": "OpenBot could not reach GitHub. Run the step again.",
  "error.workflow.handoffFailed": "OpenBot could not send this step to its agent.",
  "error.workflow.interrupted": "OpenBot stopped while this step ran. Run it again.",
  "error.workflow.nodeUnsupported": "This version of OpenBot cannot run image, file and message steps yet.",
  "error.workflow.outputChannelFailed": "OpenBot could not post the result in the channel. Run the step again.",
  "error.workflow.outputRefused": "The place refused the post. Make sure that OpenBot can post there.",
  "error.workflow.providerOffline":
    "OpenBot could not reach the provider. Check the internet connection, then run the step again.",
  "error.workflow.serverTooOld": "This server does not support workflows. Update OpenBot on the computer that runs it.",
  "error.workflow.sunraTimeout":
    "Sunra did not finish the file in time. Look in the OpenBot project on sunra.ai before you run the step again.",
  "status.agent.commitCoAuthorOff": "Stop adding OpenBot as a co-author to the commits of all agents.",
  "status.agent.commitCoAuthorOn": "Add OpenBot as a co-author to the commits of all agents again.",
  "status.agent.feedbackSending": "Sending your feedback to the OpenBot team…",
  "status.agent.feedbackSent": "Sent to the OpenBot team: {title}",
  "status.agent.mcpServerAdd":
    "Add the MCP server {name}: {target}. Every agent on this server gets its tools. OpenBot connects to it to test it.",
  "status.agent.mcpServerChange":
    "Change the MCP server {name} to {target}. Every agent on this server gets its tools. OpenBot connects to it to test it.",
  "status.agent.serverInstallCommand":
    "Make a one-time command that installs OpenBot on another computer as the server {name} and signs it in to your account. The agent runs it there.",
  "status.computerUse.driverMissing": "This build of OpenBot carries no Computer Use driver.",
  "status.host.private": "This OpenBot is private.",
  "status.host.ready": "This OpenBot is ready for WebRTC connections.",
  "status.host.registered": "Registered this OpenBot for WebRTC access.",
  "status.host.removed": "This OpenBot was removed from your account. Publish it again to share it.",
  "status.host.signalLost": "Other devices cannot reach this OpenBot now. It connects again.",
  "status.host.stopping": "Making this OpenBot private…",
  "status.messaging.answeredOnHost": "Answered on the OpenBot host.",
  "status.messaging.approvalTitle": "OpenBot asks for approval to continue.",
  "status.messaging.discordNoAgent": "No agent can answer here yet. Add the Discord Orchestrator in OpenBot.",
  "status.messaging.failed": "OpenBot could not finish this request. The OpenBot host has the details.",
  "status.messaging.hostOnly": "Only the OpenBot host can answer this request.",
  "status.messaging.noAgent": "No agent can answer here yet. Add the Slack Orchestrator in OpenBot.",
  "status.messaging.noAnswer": "OpenBot finished without a written answer.",
  "status.messaging.onlyRequester": "Only {user} can do this. The OpenBot host can also answer.",
  "status.messaging.signInReceived": "OpenBot received the Slack install. You can close this tab.",
  "status.messaging.signInUnknown": "OpenBot did not start this Slack install. Start it again in OpenBot.",
  "status.messaging.telegramLinked":
    "OpenBot is connected to this chat. Mention {bot} or reply to a message of OpenBot to ask the agents.",
  "status.messaging.telegramNoAgent": "No agent can answer here yet. Add the Telegram Orchestrator in OpenBot.",
  "status.messaging.whatsappNoAgent": "No agent can answer here yet. Add the WhatsApp Orchestrator in OpenBot.",
  "status.messaging.whatsappOtherOpenBot":
    "Another OpenBot is linked to this WhatsApp number, so you can get two answers. To fix this, open Linked devices in WhatsApp on your phone and log out the OpenBot that you do not use.",
  "status.messaging.whatsappPaused":
    "OpenBot stopped answering here for 10 minutes: too many messages came in a short time. If another OpenBot is linked to this number, open Linked devices in WhatsApp on your phone and log out the OpenBot that you do not use.",
  "status.messaging.whatsappWelcomeDedicated":
    "👋 *OpenBot is connected*\n\nThe people you allow in OpenBot can now write to this number. A new person gets a code: approve it in OpenBot under Requests.\n\nSend *stop* to stop a request.",
  "status.messaging.whatsappWelcomeOwn":
    "👋 *OpenBot is connected*\n\nWrite here to ask your agents. The WhatsApp Orchestrator answers, or gives the work to the right agent.\n\nSend *stop* to stop a request.",
  "status.provider.claudeOwnApiKey":
    "Claude Code is set to use an Anthropic API key. Anthropic bills each request to the key's API credit, not to your Claude plan. To use your plan, remove the key from the Claude Code settings or the environment variables, then restart OpenBot.",
} satisfies PartialTranslation<typeof source>;
