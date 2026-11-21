import { brainResponseSchema } from "@pokebots/contracts/brain";
export const decodeBrainFromMain = (value: unknown) => brainResponseSchema.parse(value);
