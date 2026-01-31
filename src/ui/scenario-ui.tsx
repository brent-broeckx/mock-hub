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
        { key: "happy-path", label: "[MockHub] Happy Path (default)", value: undefined },
        { key: "auto-gen-400", label: "[MockHub] auto-gen-400", value: "auto-gen-400" },
        { key: "auto-gen-401", label: "[MockHub] auto-gen-401", value: "auto-gen-401" },
        { key: "auto-gen-403", label: "[MockHub] auto-gen-403", value: "auto-gen-403" },
        { key: "auto-gen-404", label: "[MockHub] auto-gen-404", value: "auto-gen-404" },
        { key: "auto-gen-408", label: "[MockHub] auto-gen-408", value: "auto-gen-408" },
        { key: "auto-gen-409", label: "[MockHub] auto-gen-409", value: "auto-gen-409" },
        { key: "auto-gen-422", label: "[MockHub] auto-gen-422", value: "auto-gen-422" },
        { key: "auto-gen-429", label: "[MockHub] auto-gen-429", value: "auto-gen-429" },
        { key: "auto-gen-500", label: "[MockHub] auto-gen-500", value: "auto-gen-500" },
        { key: "auto-gen-502", label: "[MockHub] auto-gen-502", value: "auto-gen-502" },
        { key: "auto-gen-503", label: "[MockHub] auto-gen-503", value: "auto-gen-503" },
        { key: "auto-gen-504", label: "[MockHub] auto-gen-504", value: "auto-gen-504" },
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
        <Text>Mock Hub — Scenario Selector</Text>
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
