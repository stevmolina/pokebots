import { brainResponseSchema } from "@pokebots/contracts/brain";
export const decodeBrainFromHost = (value: unknown) => brainResponseSchema.parse(value);
