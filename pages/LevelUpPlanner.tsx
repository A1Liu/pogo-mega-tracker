import React, { useEffect } from "react";
import { ScrollWindow } from "../components/ScrollWindow";
import {
  SelectPage,
  SelectPokemon,
  useSelectedPokemonId,
} from "../components/PageState";
import {
  MegaEvolveEvent,
  addPlannedEventRpc,
  clearPokemonRpc,
  deletePlannedEventRpc,
  megaLevelPlanForPokemonRpc,
  setDateOfEventRpc,
} from "../server/planner.server";
import { useDb } from "../server/db.server";
import { TimeSlider } from "../components/EditableField";
import { useCurrentSecond } from "../components/CountdownTimer";
import { useMutation, useQuery } from "@tanstack/react-query";

function DateText({ date }: { date: Date }) {
  const { now } = useCurrentSecond();

  const isToday = date.toLocaleDateString() === now.toLocaleDateString();
  return (
    <div
      style={{
        position: "absolute",
        left: "0",
        top: "0",
        bottom: "0",
        width: "16rem",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        textAlign: "right",
        fontSize: isToday ? "1.3rem" : "1rem",
      }}
    >
      {date.toDateString()} {isToday && "(Today)"}
    </div>
  );
}

function EmptyDay({ pokemonId, date }: { pokemonId: string; date: Date }) {
  const { mutate: addPlannedEvent } = useMutation({
    mutationFn: addPlannedEventRpc,
  });

  return (
    <div style={{ width: "12rem" }}>
      <button
        onClick={() =>
          addPlannedEvent({ pokemonId, isoDate: date.toISOString() })
        }
      >
        Mega
      </button>
    </div>
  );
}

function EventInfo({ event }: { event: MegaEvolveEvent }) {
  const { mutate: deletePlannedEvent, isPending: deleteLoading } = useMutation({
    mutationFn: deletePlannedEventRpc,
  });
  const { mutate: setEventDate, isPending: setDateLoading } = useMutation({
    mutationFn: setDateOfEventRpc,
  });

  const { id, title, date } = event;

  if (!id) {
    return (
      <div
        style={{
          width: "20rem",
          color: "gray",
        }}
      >
        {title}
      </div>
    );
  }

  return (
    <div
      className={"row"}
      style={{
        width: "20rem",
        gap: "0.5rem",
        color: "black",
      }}
    >
      <TimeSlider
        value={new Date(date)}
        displayDate={(d) => d.toLocaleTimeString()}
        setValue={(eventDate) =>
          setEventDate({ id, isoDate: eventDate.toISOString() })
        }
        disabled={deleteLoading || setDateLoading}
      />

      {title}
      <button
        disabled={deleteLoading || setDateLoading}
        onClick={() => deletePlannedEvent({ id })}
      >
        X
      </button>
    </div>
  );
}

function SmallDot() {
  return (
    <div
      style={{
        position: "absolute",
        top: "0",
        bottom: "0",
        left: "17rem",
        height: "1rem",
        width: "1rem",
        borderRadius: "1rem",
        backgroundColor: "blue",
      }}
    />
  );
}

function DayBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        height: "1rem",
        width: "1rem",
      }}
    >
      {children}
    </div>
  );
}

export function LevelUpPlanner() {
  const selectedMonId = useSelectedPokemonId() ?? "";

  const { data: days, refetch } = useQuery({
    queryKey: ["megaLevelPlanForPokemonRpc", selectedMonId] as const,
    queryFn: (ctx) => megaLevelPlanForPokemonRpc({ id: ctx.queryKey[1] }),
  });

  const { mutate: clearPlans, isPending: clearPlansLoading } = useMutation({
    mutationFn: clearPokemonRpc,
  });

  const db = useDb();

  useEffect(() => {
    refetch();
  }, [db, refetch]);

  return (
    <div className={"col full robin-rounded robin-gap robin-pad"}>
      <div className={"row robin-gap"} style={{ flexWrap: "wrap" }}>
        <SelectPage />

        <SelectPokemon />

        <button
          disabled={clearPlansLoading}
          onClick={() => {
            if (selectedMonId) {
              clearPlans({ pokemonId: selectedMonId });
            }
          }}
        >
          Clear
        </button>
      </div>

      <ScrollWindow
        className={"full"}
        style={{ background: "white" }}
        innerClassName={"col robin-pad"}
        innerStyle={{
          alignItems: "flex-start",
          gap: "1.5rem",
        }}
      >
        {days?.map(({ date, energyAtStartOfDay, eventsToday }) => (
          <DayBox key={date}>
            <DateText date={new Date(date)} />

            <SmallDot />

            <div
              className={"row"}
              style={{
                position: "absolute",
                gap: "0.5rem",
                left: "19rem",
                top: 0,
                alignItems: "flex-start",
              }}
            >
              <p>{energyAtStartOfDay}</p>

              <>
                {eventsToday.length === 0 && (
                  <EmptyDay pokemonId={selectedMonId} date={new Date(date)} />
                )}

                {eventsToday.map((event) => (
                  <EventInfo key={`${event.id ?? event.date}`} event={event} />
                ))}
              </>
            </div>
          </DayBox>
        ))}
      </ScrollWindow>
    </div>
  );
}
