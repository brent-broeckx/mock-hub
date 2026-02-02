import { execa as baseExeca } from "execa";

export const execa = (
  command: string,
  args: string[],
  options: Parameters<typeof baseExeca>[2] = {}
) => {
  return baseExeca(command, args, {
    reject: false,
    env: {
      CI: "1",
      ...options.env,
    },
    ...options,
  });
};
