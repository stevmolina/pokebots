import { brainResponseSchema } from "@openbot/contracts/brain";
export const decodeBrainFromHost = (value: unknown) => brainResponseSchema.parse(value);
