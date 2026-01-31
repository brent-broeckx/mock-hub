import React, { useMemo, useState } from "react";
import { Box, Text, render } from "ink";
import SelectInput from "ink-select-input";

type SelectItem<T> = {
  key?: string;
  label: string;
  value: T;
};

export type ScenarioChoice = string | undefined;

export const startScenarioUI = (
  scenarios: string[],
  current: string | undefined,
  onSelect: (scenario?: string) => void
): void => {
  const ScenarioApp = () => {
    const [selected, setSelected] = useState<string | undefined>(current);

    const items = useMemo<SelectItem<ScenarioChoice>[]>(() => {
      const base: SelectItem<ScenarioChoice>[] = [
        { key: "happy-path", label: "Happy Path (default)", value: undefined },
        { key: "auto-gen-500", label: "auto-gen-500", value: "auto-gen-500" },
        { key: "auto-gen-503", label: "auto-gen-503", value: "auto-gen-503" },
      ];

      const custom = scenarios.map<SelectItem<ScenarioChoice>>((scenario) => ({
        key: scenario,
        label: scenario,
        value: scenario,
      }));
      return [...base, ...custom];
    }, [scenarios]);

    return (
      <Box flexDirection="column" padding={1}>
        <Text>Integration Mock Hub — Scenario Selector</Text>
        <SelectInput<ScenarioChoice>
          items={items}
          onSelect={(item: SelectItem<ScenarioChoice>) => {
            setSelected(item.value);
            onSelect(item.value);
          }}
          initialIndex={Math.max(
            items.findIndex((item) => item.value === selected),
            0
          )}
        />
        <Box marginTop={1}>
          <Text>Active: {selected ?? "Happy Path"}</Text>
        </Box>
      </Box>
    );
  };

  render(<ScenarioApp />);
};
