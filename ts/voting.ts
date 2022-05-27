import Discord, {
  Message,
  Guild,
  Client,
  Intents,
  MessageEmbed,
  TextChannel,
} from "discord.js";
import MySql, { Pool } from "mysql";
import { exit, env, argv } from "process";

import {
  FixedArray,
  range,
  embedTemplate,
  multipleCallback,
  checkFourInARow,
  never,
} from "./util.js";
import config from "../config.json" assert { type: "json" };

type Config = {
  bot_token: string;
  title: string;
  description: string;
  prefix: string;
  database: string;
  width: number;
  height: number;
  spamBlacklistCount: number;

  ids: {
    guild: string;
    channelEkrem: string;
    channelRedTeam: string;
    channelBlueTeam: string;
    channelChooseTeam: string;
  };

  channelNames: {
    ekremChannel: string;
    chooseTeam: string;
    redTeam: string;
    blueTeam: string;
    trashTalk: string;
  };

  roleNames: {
    redTeam: string;
    blueTeam: string;
  };

  admins: string[];

  activity: {
    type: string;
    command: string;
  };

  admin_commands: {
    list: string;
    reset: string;
    blacklist: string;
    unblacklist: string;
  };
};

enum Team {
  RED = 0,
  BLUE = 1,
}

type State = {
  client: Client;
  database: Pool;
  config: Config;
  board?: Board<number, number>; // Array of columns.
  guild?: Guild;
  // ekremChannel?: TextChannel;
  ekremMessage?: Message;
  // redChannel?: TextChannel;
  // blueChannel?: TextChannel;
  channels?: {
    [key in keyof Config["channelNames"]]: TextChannel;
  };

  roundNumber?: number;
  moveNumber?: number;
  whoseTurn?: Team | -1;
};

type Board<W extends number, H extends number> = FixedArray<
  W,
  FixedArray<H, Team | -1>
>;

const emojiNumbers = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"];
const emojiBoard = ["🔴", "🔵"];
const emojiAny = "⚪";

function initBoard<W extends number, H extends number>(
  width: W,
  height: H
): Board<W, H> {
  return [...range(width)].map((_) =>
    [...range(height)].map((_) => -1)
  ) as Board<W, H>;
}

async function getBoardEmbed(state: State): Promise<MessageEmbed> {
  const { board, whoseTurn } = state;

  const team = ["Red", "Blue"][whoseTurn!] ?? "Any";
  const embed = embedTemplate().setTitle(`${team} Team's Turn!`);

  const rows = board!.map(() => "");
  board!.map((boardColumn) => {
    for (const y of range(boardColumn.length))
      rows[y] += `${emojiBoard[boardColumn[y]] ?? emojiAny}`;
  });

  const description = `${emojiNumbers.join("")}\n${rows.join("\n")}`;
  embed.setDescription(description);

  return await updateEmbedWithDescription(state, embed);
}

async function updateEmbedWithDescription(
  state: State,
  embed: MessageEmbed
): Promise<MessageEmbed> {
  const { board, whoseTurn, roundNumber, moveNumber } = state;
  let [[{ user_id }]] = await query(
    state,
    `select * from moves where round_number = ${roundNumber} order by move_number desc limit 1`
  );

  let [[{ red, blue }]] = await query(state, `select * from wins`);

  let add = [
    `Round ${roundNumber}`,
    `Move ${moveNumber}`,

    user_id
      ? `Last move by <@${user_id}>`
      : `Join a team at <#${state.channels?.chooseTeam.id}> and start a new game!`,
    `Wins:`,
    `Red Team - ${red}`,
    `Blue Team - ${blue}`,
  ].join("\n");

  return embed.setDescription(embed.description + "\n" + add);
}

function query(
  state: Pool | State,
  query: string
): Promise<[any, MySql.FieldInfo[]]> {
  const database = "database" in state ? state.database : state;
  return new Promise((resolve, reject) => {
    database.query(query, (error, results, fields) => {
      if (error) reject(error);
      // This is fine, fields is only undefined if there is an error.
      else resolve([results, fields as MySql.FieldInfo[]]);
    });
  });
}

async function isBlacklisted(state: State, user: string): Promise<boolean> {
  let [results] = await query(
    state,
    `select * from blacklist where user_id = ${user}`
  );

  return results.length > 0;
}

/**
 * Expecects ekremMessage to not be undefined.
 */
async function updateEkrem(state: State) {
  await state.ekremMessage!.edit({
    // TODO: updateEmbedWithDescription
    //embeds: [await updateEmbedWithDescription(getBoardEmbed(state))],
    embeds: [await getBoardEmbed(state)],
  });
}

/**
 * Expects ekremChannel to not be undefined.
 */
async function getState(state: State): Promise<boolean> {
  const { client, database, config, channels } = state;
  const [stateResults] = await query(database, "select * from state");

  if (stateResults.length == 0) {
    // If there is no state, initialize everything.
    state.roundNumber = 1;
    state.moveNumber = 1;
    state.whoseTurn = -1;
    state.ekremMessage = await channels?.ekremChannel!.send({
      embeds: [
        embedTemplate()
          .setTitle("lol")
          .setDescription("ur not supposed to see this lol"),
      ],
    });

    await query(
      database,
      `insert into state (msg_id, round_number, move_number, whose_turn) values (${
        state.ekremMessage!.id
      }, 1, 1, -1)`
    );
    return true;
  } else {
    // If there is a state, load it.
    const { msg_id, round_number, move_number, whose_turn } = stateResults[0];
    state.roundNumber = round_number;
    state.moveNumber = move_number;
    state.whoseTurn = whose_turn ? Team.BLUE : Team.RED;

    try {
      state.ekremMessage = await channels?.ekremChannel!.messages.fetch(msg_id);
      return false;
    } catch {
      // No message found? No issue, make a new one.
      state.ekremMessage = await channels?.ekremChannel!.send({
        embeds: [
          embedTemplate()
            .setTitle("lol")
            .setDescription("ur not supposed to see this lol"),
        ],
      });

      await query(
        database,
        `update state set msg_id = ${state.ekremMessage!.id}`
      );
    }
  }

  const [moveResults] = await query(
    database,
    `select * from moves where round_number = ${state.roundNumber}`
  );
  for (const { column_number, color } of moveResults)
    await placePiece(state, column_number, color ? Team.BLUE : Team.RED);

  await updateEkrem(state);
  return true;
}

/**
 * Excpects board and moveNumber to not be undefined.
 */
async function placePiece(
  state: State,
  columnNumber: number,
  team: Team,
  by?: string
): Promise<number | undefined> {
  const { board, database } = state;
  const column = board![columnNumber];

  for (const y of [...range(column.length)].reverse()) {
    // If there is room for a piece, place it.
    // Almost always, this will be the first empty spot.
    if (column[y] == -1) {
      column[y] = team;

      // We only update the database if there is a user.
      if (by != null) {
        // TODO: we're really vulnerable to sql injections aren't we?
        // even if the user data is sanitized, there's always a chance.

        // Insert the move into the database.
        await query(
          database,
          `insert into moves (round_number, move_number, column_number, color, user_id, ts) values (${
            state.roundNumber
          }, ${state.moveNumber}, ${columnNumber}, ${
            team == Team.BLUE
          }, '${by}', ${Date.now()})`
        );

        // Update the user's move count.
        await query(
          database,
          `
          insert into users (user_id, moves) values ('${by}', 1)
            on duplicate key update moves = moves + 1
          `
        );

        // Update the move number in state and the database.
        await query(
          database,
          `update state set move_number = ${++state.moveNumber!}`
        );

        // Update whose turn it is in state and the database.
        await query(
          database,
          `update state set whose_turn = ${(state.whoseTurn =
            state.whoseTurn == Team.BLUE ? Team.RED : Team.BLUE)}`
        );
      }

      return y;
    }
  }
}

/**
 * This ensures that only one message is processed at a time.
 */
async function handleMessages(state: State) {
  const { client, database, config } = state;

  const messages = multipleCallback<Message>((callback) =>
    client.on("messageCreate", callback)
  );

  for await (const message of messages) await onMessage(state, message);
}

async function onReady(state: State) {
  const { client, database, config } = state;
  console.log(`Logged in as ${client.user!.tag}!`);

  // Cache stuff from Discord so we don't have to keep querying for things.
  state.guild = client.guilds.cache.get(config.ids.guild)!;

  let channels: any = {};
  for (let channelName of Object.entries(config.channelNames)) {
    console.log(channelName);
    channels[channelName[0]] = state.guild.channels.cache.find(
      (channel) => channel.name == channelName[1]
    );
  }

  state.channels = { ...channels };

  state.board = initBoard(config.width, config.height);

  await getState(state);
  //await getWins();

  // TODO: ??? Duplicate code?
  /*
  if (!update) {
    let [results, fields] = await db.execQuery(
      `select * from moves where round_number = ${global.round_number}`
    );
    for (let result of results) {
      await placePiece(result.column_number, result.color);
    }
  }

  if (update) await updateEkrem();*/
}

async function onMessage(state: State, message: Message) {
  const { client, database, config } = state;

  // No non normal messages.
  if (!["DEFAULT", "REPLY"].includes(message.type)) return;
  // No bots.
  if (message.author.bot) return;
  // No non guild messages.
  if (!(message.channel instanceof TextChannel)) return;

  // Handle moves.
  const team =
    message.channel.name == config.channelNames.redTeam
      ? Team.RED
      : message.channel.name == config.channelNames.blueTeam
      ? Team.BLUE
      : -1;
  if (team != -1) handlePlace(state, message, team);

  // TODO: Handle commands.
}

async function handlePlace(state: State, message: Message, team: Team) {
  const { client, database, config } = state;

  const column = parseInt(message.content);
  if (isNaN(column) || column < 1 || column > 7) return;

  if (await isBlacklisted(state, message.author.id)) {
    // TODO: Handle blacklisting.
    return;
  }

  // TODO: Handle repeat moves.

  if (state.whoseTurn! != team && state.whoseTurn! != -1) {
    const name = ["Red", "Blue"][state.whoseTurn!];
    await message.reply({
      embeds: [
        embedTemplate()
          .setTitle("Hold your horses!!")
          .setDescription(`It's ${name} Team's turn!`),
      ],
    });
    return;
  }

  const piece = await placePiece(state, column - 1, team, message.author.id);
  if (piece != null) {
    const embed = await getBoardEmbed(state);

    if (checkFourInARow(state.board!, [team])) {
      // Win detection.
      const name = ["Red", "Blue"][team];
      embed.setTitle(`${name} Team wins!`);

      // Update the database and state.
      const winning = ["blue", "red"][state.whoseTurn!];
      await query(
        state,
        `update state set round_number = ${++state.roundNumber!}`
      );
      await query(
        state,
        `update state set move_number = ${(state.moveNumber = 0)}`
      );
      await query(state, `update wins set ${winning} = ${winning} + 1`);
      await query(
        state,
        `update state set whose_turn = ${(state.whoseTurn = -1)}`
      );
      state.board = initBoard(state.config.width, state.config.height);
    } else if (
      !checkFourInARow(state.board!, [-1, Team.RED]) &&
      !checkFourInARow(state.board!, [-1, Team.BLUE])
    ) {
      // Tie detection.
      embed.setTitle("Tie (anyone can start a new game)");

      // Update the database and state.
      await query(
        state,
        `update state set round_number = ${++state.roundNumber!}`
      );
      await query(
        state,
        `update state set move_number = ${(state.moveNumber = 0)}`
      );
      await query(
        state,
        `update state set whose_turn = ${(state.whoseTurn = -1)}`
      );
      state.board = initBoard(state.config.width, state.config.height);
    }

    await state.channels?.redTeam!.send({ embeds: [embed] });
    await state.channels?.blueTeam!.send({ embeds: [embed] });
    await updateEkrem(state);
  } else {
    await message.reply({
      embeds: [
        embedTemplate()
          .setTitle("Oh no!!")
          .setDescription(`That column is already full!`),
      ],
    });
  }
}

async function main(
  arguments_: string[],
  environment: typeof env
): Promise<number> {
  const activeConfig: Config = config.development;

  const client = new Client({
    intents: new Intents(32767), // all intents
    partials: ["CHANNEL"], // Required to receive DMs
  });

  const database = MySql.createPool({
    connectionLimit: 10,
    host: "localhost",
    user: "root",
    password: "password",
    database: activeConfig.database,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  const state: State = { database, client, config: activeConfig };

  client.on("ready", () => onReady(state));
  handleMessages(state);

  client.login(env["TOKEN"] || activeConfig.bot_token);

  await never();
  return -1;
}

main(argv, env).then(
  (status) => exit(status),
  (error) => {
    console.error(error);
    exit(255);
  }
);
