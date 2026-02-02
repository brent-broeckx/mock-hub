import { execa as baseExeca, type Options } from "execa";

export const execa = (
  command: string,
  args: string[],
  options: Options = {}
) => {
  return baseExeca(command, args, {
    reject: false,
    env: {
      CI: "1",
      ...(options.env ?? {}),
    },
    ...options,
  });
};
