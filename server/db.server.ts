import { z } from "zod";
import { produce } from "immer";
import {
  computeEvolve,
  isCurrentMega,
  PlannedMega,
  Pokemon,
  Species,
} from "../domain-utils";
import { HOUR_MS } from "../math";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ZustandIdbStorage } from "../persist-utils";

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

export type PogoDb = z.infer<typeof PogoDb>;
const PogoDb = z.object({
  pokedex: z.record(z.coerce.number(), Species),
  pokemon: z.record(z.string(), Pokemon),
  evolvePlans: z.array(PlannedMega),
  mostRecentMega: z.object({ id: z.string() }).optional(),
});

interface Actions {
  withDb: (mut: (db: PogoDb) => void) => Promise<PogoDb>;
}

const EmptyDb: PogoDb = {
  pokedex: {},
  pokemon: {},
  evolvePlans: [],
};

export const useDb = create<PogoDb & { actions: Actions }>()(
  persist(
    (set, get) => {
      return {
        ...EmptyDb,
        actions: {
          withDb: async (mut) => {
            const { actions, ...dbData } = get();
            const newDb = produce(dbData, mut);
            if (newDb !== dbData) {
              console.log("DB access caused mutation");

              set(newDb);
            }

            return newDb;
          },
        },
      };
    },
    {
      name: "pogo-db",
      storage: ZustandIdbStorage,
      partialize: ({ actions, ...rest }) => rest,
    },
  ),
);

export const withDb = useDb.getState().actions.withDb;

export async function setDbValueRpc({ db }: { db: PogoDb }) {
  return await withDb((prev) => {
    prev.pokedex = db.pokedex;
    prev.pokemon = db.pokemon;
    prev.mostRecentMega = db.mostRecentMega;
    prev.evolvePlans = db.evolvePlans;
  });
}

export async function fetchDbRpc(): Promise<PogoDb> {
  return useDb.getState() ?? EmptyDb;
}

export function getDB(): PogoDb {
  return useDb.getState() ?? EmptyDb;
}

export async function addPokemonRpc({ pokedexId }: { pokedexId: number }) {
  const id = `${pokedexId}-${Math.random()}`;
  const wayBackWhen = new Date(0).toISOString();
  await withDb((db) => {
    db.pokemon[id] = {
      id,
      pokedexId,
      megaCount: 0,

      // This causes some strange behavior but... it's probably fine.
      lastMegaStart: wayBackWhen,
      lastMegaEnd: wayBackWhen,
    };
  });

  return {};
}

export async function clearCurrentMegaRpc() {
  await withDb((db) => {
    const mostRecentMega = db.pokemon[db.mostRecentMega?.id ?? ""];
    if (mostRecentMega) {
      const now = new Date();
      const prevMegaEnd = new Date(mostRecentMega.lastMegaEnd);
      mostRecentMega.lastMegaEnd = new Date(
        Math.min(now.getTime(), prevMegaEnd.getTime()),
      ).toISOString();
    }
  });

  return {};
}

export async function evolvePokemonRpc({ id }: { id: string }) {
  await withDb((db) => {
    const pokemon = db.pokemon[id];
    const dexEntry = db.pokedex[pokemon.pokedexId];

    // rome-ignore lint/complexity/useSimplifiedLogicExpression: I'm not fucking applying demorgan's law to this
    if (!pokemon || !dexEntry) return;

    const now = new Date();

    if (isCurrentMega(db.mostRecentMega?.id, pokemon, now)) {
      console.log("Tried to evolve the currently evolved pokemon");
      return;
    }

    const nextData = computeEvolve(now, dexEntry, pokemon);

    dexEntry.megaEnergyAvailable -= Math.min(
      dexEntry.megaEnergyAvailable,
      nextData.megaEnergySpent,
    );

    pokemon.lastMegaStart = nextData.lastMegaStart;
    pokemon.lastMegaEnd = nextData.lastMegaEnd;
    pokemon.megaCount = nextData.megaCount;

    // If there's a pokemon who is set as "mostRecentMega", and they're not the current
    // pokemon we're evolving now, we should try to update their mega time; however,
    // the Math.min prevents any problems with overwriting a stale mega pokemon.
    //
    // It might be possible to write this condition a little cleaner, but for now,
    // this is fine.
    const mostRecentMega = db.pokemon[db.mostRecentMega?.id ?? ""];
    if (mostRecentMega && mostRecentMega.id !== pokemon.id) {
      const prevMegaEnd = new Date(mostRecentMega.lastMegaEnd);
      mostRecentMega.lastMegaEnd = new Date(
        Math.min(now.getTime(), prevMegaEnd.getTime()),
      ).toISOString();
    }

    db.mostRecentMega = { id };
  });

  return {};
}

export async function setPokemonMegaEndRpc({
  id,
  newMegaEnd,
}: {
  id: string;
  newMegaEnd: string;
}) {
  await withDb((db) => {
    const pokemon = db.pokemon[id];
    if (!pokemon) return;

    pokemon.lastMegaEnd = newMegaEnd;
    const newMegaDate = new Date(newMegaEnd);

    const newMegaDateEightHoursBefore = new Date(
      newMegaDate.getTime() - 8 * HOUR_MS,
    );

    const lastMegaStartDate = new Date(pokemon.lastMegaStart);
    if (newMegaDate < lastMegaStartDate) {
      pokemon.lastMegaStart = newMegaEnd;
    }
    if (newMegaDateEightHoursBefore > lastMegaStartDate) {
      pokemon.lastMegaStart = newMegaEnd;
    }
  });

  return {};
}

export async function setPokemonMegaCountRpc({
  id,
  count,
}: {
  id: string;
  count: number;
}) {
  await withDb((db) => {
    const pokemon = db.pokemon[id];
    if (!pokemon) return;

    pokemon.megaCount = Math.min(Math.max(count, 0), 30);
  });

  return {};
}

export async function setPokemonMegaEnergyRpc({
  pokedexId,
  megaEnergy,
}: {
  pokedexId: number;
  megaEnergy: number;
}) {
  await withDb((db) => {
    const dexEntry = db.pokedex[pokedexId];
    if (!dexEntry) return;

    dexEntry.megaEnergyAvailable = Math.max(megaEnergy, 0);
  });

  return {};
}

export async function deletePokemonRpc({ id }: { id: string }) {
  await withDb((db) => {
    // rome-ignore lint/performance/noDelete: fucking idiot rule
    delete db.pokemon[id];
  });

  return {};
}

export async function setNameRpc({ id, name }: { id: string; name: string }) {
  await withDb((db) => {
    const pokemon = db.pokemon[id];
    if (!pokemon) return;

    pokemon.name = name;
  });

  return {};
}

