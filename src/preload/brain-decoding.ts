import { brainResponseSchema } from "@openbot/contracts/brain";
export const decodeBrainFromMain = (value: unknown) => brainResponseSchema.parse(value);
