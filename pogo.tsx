import React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ext.css";
import { usePageState } from "./components/PageState";
import { EventPlanner } from "./pages/EventPlanner";
import { PokemonManager } from "./pages/PokemonManager";
import { CostTables } from "./pages/CostTables";
import { LevelUpPlanner } from "./pages/LevelUpPlanner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function Page() {
  const { selectedPage } = usePageState();

  switch (selectedPage) {
    case "pokemon":
      return <PokemonManager />;

    case "planner":
      return <EventPlanner />;
    case "tables":
      return <CostTables />;
    case "levelup":
      return <LevelUpPlanner />;

    default:
      return <></>;
  }
}

// "PoGo" is an abbreviation for Pokemon Go which is well-known in the
// PoGo community.
export function Pogo(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <Page />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Pogo />
  </StrictMode>,
);
