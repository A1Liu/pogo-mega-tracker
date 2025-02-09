import React, { useEffect } from "react";
import { refreshDexRpc, searchPokemonRpc } from "../server/pogo.server";
import { ScrollWindow } from "../components/ScrollWindow";
import {
  addPokemonRpc,
  clearCurrentMegaRpc,
  setDbValueRpc,
  useDb,
} from "../server/db.server";
import { PokemonInfo } from "../components/PokemonInfo";
import { SelectPage } from "../components/PageState";
import { useSelectOption } from "../components/EditableField";
import { useMutation, useQuery } from "@tanstack/react-query";

// TODO: planner for upcoming events
// TODO: put POGO thingy into its own package on NPM, and debug why packages sorta dont work right now

function SelectSpecies({
  submit,
  buttonText,
}: {
  submit: (data: { pokedexId: number }) => unknown;
  buttonText: string;
}) {
  const { pokedex = {} } = useDb();
  const { selected, ...selectMon } = useSelectOption(pokedex);

  return (
    <div className={"row robin-gap"}>
      <select {...selectMon}>
        <option>---</option>

        {Object.entries(pokedex).map(([id, dexEntry]) => {
          return (
            <option key={id} value={id}>
              {dexEntry.name}
            </option>
          );
        })}
      </select>

      <button
        disabled={!selected}
        onClick={() => selected && submit({ pokedexId: selected.number })}
      >
        {buttonText}
      </button>
    </div>
  );
}

function downloadObjectAsJson(exportObj: unknown, exportName: string) {
  var dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(exportObj),
  )}`;
  var downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", `${exportName}.json`);
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

const Sorts = ["name", "pokedexId", "megaTime", "megaLevelUp"] as const;
export function PokemonManager() {
  const [sortIndex, setSortIndex] = React.useState<number>(0);
  const sort = Sorts[sortIndex] ?? "name";

  const db = useDb();

  const { data: pokemon, refetch: refetchQuery } = useQuery({
    queryKey: ["searchPokemon", sort] as const,
    queryFn: (ctx) => searchPokemonRpc({ sort: ctx.queryKey[1] }),
  });
  const { mutate: refreshDex } = useMutation({ mutationFn: refreshDexRpc });
  const { mutate: clearCurrentMega } = useMutation({
    mutationFn: clearCurrentMegaRpc,
  });
  const { mutate: addPokemon } = useMutation({ mutationFn: addPokemonRpc });
  const { mutate: setDb, isPending: setDbIsLoading } = useMutation({
    mutationFn: setDbValueRpc,
  });

  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    refetchQuery();
  }, [db, refetchQuery]);

  return (
    <div className={"col full robin-rounded robin-gap robin-pad"}>
      <div className={"row robin-gap"} style={{ flexWrap: "wrap" }}>
        <SelectPage />

        <div className={"col"}>
          <p>Sort by:</p>
          <select
            value={sortIndex}
            onChange={(evt) => {
              const index = Number.parseInt(evt.target.value);
              setSortIndex(index);
            }}
          >
            {Sorts.map((sort, index) => {
              return (
                <option key={sort} value={index}>
                  {sort}
                </option>
              );
            })}
          </select>
        </div>

        <div className={"col"} style={{ gap: "0.25rem" }}>
          {db && Object.keys(db.pokedex).length === 0 && (
            <div>Pokedex is empty!</div>
          )}
          <button onClick={() => refreshDex()}>Refresh Pokedex</button>

          <button onClick={() => clearCurrentMega()}>Clear Mega</button>
        </div>

        <div className={"col"} style={{ gap: "0.25rem" }}>
          <button
            disabled={setDbIsLoading}
            onClick={() => {
              const now = new Date();
              const month = String(now.getMonth()).padStart(2, "0");
              const day = String(now.getDate()).padStart(2, "0");
              const name = `pogo-bkp ${now.getFullYear()}-${month}-${day}`;

              downloadObjectAsJson(db, name);
            }}
          >
            Save DB
          </button>

          <button
            disabled={setDbIsLoading}
            onClick={() => inputRef.current?.click()}
          >
            Load DB
          </button>
        </div>

        <input
          ref={inputRef}
          id="image-file"
          type="file"
          style={{ display: "none" }}
          onChange={async (evt) => {
            const file = evt.target.files?.[0];
            if (!file) {
              console.log("it was null");
              return;
            }

            const newDb = JSON.parse(await file.text());
            setDb({ db: newDb });
          }}
        />
      </div>

      <ScrollWindow
        className={"full"}
        style={{ backgroundColor: "white" }}
        innerClassName={"col robin-gap robin-pad"}
        innerStyle={{ gap: "0.5rem", paddingRight: "0.5rem" }}
      >
        <div
          className={"robin-rounded robin-pad"}
          style={{ backgroundColor: "Gray" }}
        >
          <SelectSpecies submit={addPokemon} buttonText={"Add"} />
        </div>

        {!!db &&
          pokemon?.map((id) => {
            const pokemon = db.pokemon[id];
            if (!pokemon) {
              return null;
            }

            return <PokemonInfo key={id} pokemon={pokemon} />;
          })}
      </ScrollWindow>
    </div>
  );
}
