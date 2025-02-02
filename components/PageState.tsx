import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import React from "react";
import { useDb } from "../server/db.server";
import { ZustandIdbStorage } from "../persist-utils";

const DefaultPage = "pokemon" as const;

// I'm not handling errors in this file, because... oh well. Whatever. Meh.
const PageTypes = ["pokemon", "planner", "tables", "levelup"] as const;
type PageType = (typeof PageTypes)[number];

export type PageState = z.infer<typeof PageState>;
const PageState = z.object({
  selectedPokemonId: z.string().optional().nullable(),
  selectedPage: z.union([
    z.literal("pokemon"),
    z.literal("planner"),
    z.literal("tables"),
    z.literal("levelup"),
  ]),
});

interface Actions {
  setPage: (a: PageType) => void;
  setPokemon: (a: string | null) => void;
}

export const usePageState = create<PageState & { actions: Actions }>()(
  persist(
    (set, _get) => {
      return {
        selectedPage: DefaultPage,
        actions: {
          setPage: (a) => set({ selectedPage: a }),
          setPokemon: (a) => set({ selectedPokemonId: a }),
        },
      };
    },
    {
      name: "page-state", // name of the item in the storage (must be unique)
      storage: ZustandIdbStorage,
      partialize: ({ actions, ...rest }) => rest,
    },
  ),
);

export function SelectPage() {
  const { selectedPage: page, actions } = usePageState();

  return (
    <div className={"col"}>
      <p>Page:</p>
      <select
        value={page}
        onChange={(evt) => actions.setPage(evt.target.value as PageType)}
      >
        {PageTypes.map((page) => (
          <option key={page} value={page}>
            {page}
          </option>
        ))}
      </select>
    </div>
  );
}

export function useSelectedPokemonId() {
  const { selectedPokemonId } = usePageState();

  return selectedPokemonId;
}

export function useSetPokemon() {
  return usePageState.getState().actions.setPokemon;
}

export function SelectPokemon() {
  const db = useDb();
  const selectedPokemon = useSelectedPokemonId();
  const setPokemon = useSetPokemon();

  const pokemon = React.useMemo(
    () => Object.values(db?.pokemon ?? {}),
    [db?.pokemon],
  );

  return (
    <div className={"col"}>
      <p>Pokemon:</p>
      <select
        value={selectedPokemon ?? ""}
        onChange={(evt) =>
          evt.target.value ? setPokemon(evt.target.value) : setPokemon(null)
        }
      >
        <option value={""}>Select pokemon...</option>

        {pokemon.map((mon) => (
          <option key={mon.id} value={mon.id}>
            {mon.name && mon.name !== db?.pokedex?.[mon.pokedexId]?.name
              ? `${mon.name} (${db?.pokedex?.[mon.pokedexId]?.name})`
              : db?.pokedex?.[mon.pokedexId]?.name}
          </option>
        ))}
      </select>
    </div>
  );
}
