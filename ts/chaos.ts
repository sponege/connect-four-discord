import Discord, {
  Message,
  MessageCreateOptions,
  Guild,
  Client,
  EmbedBuilder,
  TextChannel,
  Interaction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import MySql, { Pool } from "mysql";
import { exit, env, argv } from "process";

import {
  FixedArray,
  range,
  embedTemplate,
  multipleCallback,
  checkFourInARow,
  never,
  getWeather,
} from "./util.js";
import config from "../config.json" assert { type: "json" };

// Construct and prepare an instance of the REST module
const rest = new REST({ version: "10" });

// these store messages that have buttons we have to remove
let oldBlueMsg: Message | undefined;
let oldRedMsg: Message | undefined;

type commandTypes = {
  top: string;
  help: string;
  "help admin": string;
};

type adminCommands = {
  list: string;
  reset: string;
  blacklist: string;
  unblacklist: string;
};

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

  commands: commandTypes;

  admin_commands: adminCommands;

  weatherAPIKey: string;
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
  boardImportantCoords: Set<string>; // Array of [x, y] coordinates of X'd out spots. (used to show where the last move was or to show a win)
};

type Board<W extends number, H extends number> = FixedArray<
  W,
  FixedArray<H, Team | -1>
>;

const emojiNumbers = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"];
const emojiBoard = ["🔴", "🔵"];
//const emojiBoardX = ["❌", "🇽"];
//const emojiBoardX = ["🟥", "🟦"];
//const emojiBoardX = ["❤️", "💙"];
const emojiBoardX = ["🍎", "🔷"];
const emojiAny = "⚪";

function initBoard<W extends number, H extends number>(
  width: W,
  height: H
): Board<W, H> {
  return [...range(width)].map((_) =>
    [...range(height)].map((_) => -1)
  ) as Board<W, H>;
}

async function getBoardEmbed(
  state: State,
  finishedGame?: Boolean,
  snapshot?: Boolean,
  moveResults?: Array<{ column_number: number }>
): Promise<EmbedBuilder> {
  const { board, whoseTurn } = state;

  const team = ["Red", "Blue"][whoseTurn!] ?? "Any";
  const lastMoveCoords = state.boardImportantCoords
    .keys()
    .next()
    .value.split(",")
    .map((a: string) => Number(a));

  const teamWhomMadeLastMove = board![lastMoveCoords[0]][
    lastMoveCoords[1]
  ] as Team;
  let embed = embedTemplate().setTitle(
    finishedGame
      ? `Full Board from Round ${state.roundNumber}`
      : snapshot
      ? `Snapshot of Round ${state.roundNumber} -- ${
          ["Red", "Blue"][teamWhomMadeLastMove]
        } made the last move`
      : team == "Any"
      ? "New Game! (anyone can go first)"
      : `${team} Team's Turn!`
  );
  let winner: Team | -1;
  let fourInARow = checkFourInARow(state.board!, [0]);

  if (!(fourInARow instanceof Array))
    fourInARow = checkFourInARow(state.board!, [1]);

  if (!moveResults) {
    [moveResults] = await query(
      state,
      `select * from moves where round_number = ${state.roundNumber}`
    );
  }

  if (!moveResults) {
    throw new Error("moveResults is undefined");
  }

  console.log(moveResults);

  if (fourInARow instanceof Array) {
    state.boardImportantCoords = new Set(
      fourInARow.map((coord) => coord.join(","))
    );
    winner = state.board![fourInARow[0][0]][fourInARow[0][1]] as Team;
    // if there is a winner, the game is finished
    finishedGame = true;
  } else {
    let lastMove = moveResults[moveResults.length - 1];
    if (lastMove)
      state.boardImportantCoords = new Set([
        `${lastMove.column_number},${state.board![
          lastMove.column_number
        ].findIndex((cell) => cell != -1)}`,
      ]);
    else state.boardImportantCoords = new Set();
    winner = -1;
    if (
      !checkFourInARow(state.board!, [-1, Team.RED]) &&
      !checkFourInARow(state.board!, [-1, Team.BLUE])
    ) {
      // if game is a tie
      // game is finished
      finishedGame = true;
    }
  }

  const rows = board!.map(() => "");
  let x = 0;
  board!.map((boardColumn) => {
    if (!boardColumn) return;
    for (const y of range(boardColumn.length)) {
      rows[y] += `${
        (new Set(state.boardImportantCoords).add(`${x},${y}`).size ==
        state.boardImportantCoords.size
          ? emojiBoardX
          : emojiBoard)[boardColumn[y]] ?? emojiAny
      }`;
    }
    x++;
  });

  const description = `${emojiNumbers.join("")}\n${rows.join("\n")}`;

  let [description2, footer] = await updateEmbedWithDescription(
    state,
    embed,
    finishedGame ? true : false,
    snapshot ? true : false,
    winner ?? -1
  );

  embed = embed.setDescription(description + description2).setFooter({
    text: footer,
  });

  return embed;
}

async function updateEmbedWithDescription(
  state: State,
  embed: EmbedBuilder,
  finishedGame?: boolean,
  snapshot?: boolean,
  winner?: Team | -1
): Promise<Array<string>> {
  const { board, whoseTurn, roundNumber, moveNumber } = state;
  let user_ids: Array<Array<{ user_id: number }>>;
  let user_id: number | null;
  try {
    user_ids = await query(
      state,
      `select * from moves where round_number = ${roundNumber} and move_number < ${moveNumber} order by move_number desc`
    );
    [[{ user_id }]] = user_ids;
  } catch (e) {
    user_ids = [];
    user_id = null;
  }

  let [[{ red, blue }]] = await query(state, `select * from wins`);
  console.log(`Winner of round ${roundNumber} is ${winner!}`);

  let footerArr = [`Round ${roundNumber}`, `Move ${moveNumber}`];

  if (finishedGame)
    footerArr.push(["Draw", "Red Wins", "Blue Wins"][winner! + 1]);

  let footer = footerArr.join("・");

  let add = [
    user_id
      ? `${finishedGame ? "Final" : "Last"} move by <@${user_id}>`
      : `Join a team at <#${state.channels?.chooseTeam.id}> and start a new game!`,
  ];

  if (user_id == null) {
    footer = "";
  }

  if (!snapshot) {
    if (footer) footer += "・";
    footer += `Red: ${red}・Blue: ${blue}`;
  }
  if (user_ids[0])
    add.push(
      `👥 ${Array.from(
        // sets make everything unique, players move multiple times and we want to show each player only once, not multiple times
        new Set(user_ids[0].map((player) => "<@" + player.user_id + ">"))
      ).join(" ")}`
    );

  let description = "\n" + add.join("\n");

  return [description, footer];
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
  /*await state.ekremMessage!.edit({
    // TODO: updateEmbedWithDescription
    //embeds: [await updateEmbedWithDescription(getBoardEmbed(state))],
    embeds: [await getBoardEmbed(state)],
  });*/
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
    console.log(state);

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
    state.whoseTurn = whose_turn;
    if (state.whoseTurn != -1) state.whoseTurn = state.whoseTurn as Team;

    try {
      state.ekremMessage = await channels?.ekremChannel!.messages.fetch(msg_id);
      return false;
    } catch {
      // No message found? No issue, make a new one.
      /*      state.ekremMessage = await channels?.ekremChannel!.send({
        embeds: [
          embedTemplate()
            .setTitle("lol")
            .setDescription("ur not supposed to see this lol"),
        ],
      });

      await query(
        database,
        `update state set msg_id = ${state.ekremMessage!.id}`
      );*/
    }
  }

  const [moveResults] = await query(
    database,
    `select * from moves where round_number = ${state.roundNumber}`
  );
  for (const { column_number, color } of moveResults)
    await placePiece(state, column_number, color ? Team.BLUE : Team.RED);

  let lastMove = moveResults[moveResults.length - 1];
  if (lastMove)
    state.boardImportantCoords = new Set([
      `${lastMove.column_number},${state.board![
        lastMove.column_number
      ].findIndex((cell) => cell != -1)}`,
    ]);
  else state.boardImportantCoords = new Set();
  console.log(state.boardImportantCoords);

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

  if (column)
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
              team == Team.BLUE ? Team.RED : Team.BLUE)}`
          );
        }

        state.boardImportantCoords = new Set([`${columnNumber},${y}`]);

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

/**
 * This ensures that only one interaction is processed at a time.
 */
async function handleInteractions(state: State) {
  const { client, database, config } = state;

  const interactions = multipleCallback<Interaction>((callback) =>
    client.on("interactionCreate", callback)
  );

  for await (const interaction of interactions)
    await onInteraction(state, interaction);
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
    let [results, fields] = await query(
      `select * from moves where round_number = ${config.round_number}`
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
  if (!(message instanceof Message)) return;
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
  /*
  // TODO: Handle commands.
  var command = message.content.split(" ")[0].substr(config.prefix.length);
  if (command) if (!config.commands![command]) return;
  if (message.content.toLowerCase().startsWith(config.prefix)) {
    switch (
      command // commands for everyone
    ) {
      case "top":
        // sort by number of credits
        let [lb, fields] = await query(
          state,
          "select * from users order by moves desc limit 10"
        ); // descending
        var leaderText = "";
        for (var i = 0; i < lb.length; i++) {
          leaderText += `#${i + 1}: <@${lb[i]["user_id"]}> Moves: ${
            lb[i]["moves"]
          }\n`;
        }

        var embed = new EmbedBuilder()
          .setColor("RANDOM")
          .setTitle("Leaderboard")
          .setDescription(leaderText);

        message.channel.send({ embeds: [embed] });

        break;

      case "help":
        if (config.admins.includes(message.author.id) || op[1] != "admin") {
          var embed = embedTemplate()
            .setTitle(config.title)
            .setDescription(config.description);
          for (command of Object.entries(
            op[1] == "admin" ? config.admin_commands : config.commands
          )) {
            embed = embed.addField(config.prefix + command[0], command[1]);
          }
          await message.channel.send({ embeds: [embed] });
        } else {
          await message.channel.send({
            embeds: [
              embedTemplate()
                .setTitle("Error")
                .setDescription(
                  "You are not in the admins list in the config file!"
                ),
            ],
          });
        }
        break;
      case "adminhelp":
      case "helpadmin":
        if (config.admins.includes(message.author.id)) {
          var embed = embedTemplate()
            .setTitle(config.title)
            .setDescription(config.description);
          for (command of Object.entries(config.admin_commands)) {
            embed = embed.addField(config.prefix + command[0], command[1]);
          }
          await message.channel.send({ embeds: [embed] });
        } else {
          await message.channel.send({
            embeds: [
              embedTemplate()
                .setTitle("Error")
                .setDescription(
                  "You are not in the admins list in the config file!"
                ),
            ],
          });
        }
      case "echo":
        var response = await message.channel.send(
          contents ? contents : "You must supply a message to echo."
        );
        // await sleep(5000);
        // message.delete();
        // response.delete();
        break;
    }

    if (message.channel.type != "DM") {
      var user = message.guild.members.cache.find(
        (member) => member.id == message.author.id
      );
      if (user.permissions.has("ADMINISTRATOR")) {
        // commands for server admins
        console.log(command);
        switch (command) {
        }
      }
    }

    if (user.permissions.has("MANAGE_MESSAGES")) {
      // commands for moderators
      // (admins.includes(message.author.id)) {
      // commands for bot owners
      switch (command) {
        case "list":
          var messages = [];
          client.guilds.cache.forEach(async (guild) => {
            messages.push(
              await message.channel.send({
                embeds: [
                  new EmbedBuilder()
                    .setColor("RANDOM")
                    .setTitle(guild.name)
                    .setDescription(
                      [
                        `Members: ${guild.memberCount}`,
                        `ID: ${guild.id}`,
                        `Permissions: ${codeEsc}${
                          state.guild!.me!.permissions.toArray() || []
                        }${codeEsc}`,
                      ].join("\n")
                    )
                    .setThumbnail(state.guild!.iconURL() || ""),
                ],
              })
            );
          });
          /**
          await sleep(5000);
          message.delete();
          for (m of messages) {
            m.delete();
          }
          break;
        case "reset":
          state.ekremMessage!.delete();
          await query(state, `truncate users`);
          await query(state, `truncate wins`);
          await query(state, `truncate moves`);
          await query(state, `truncate state`);
          await message.channel.send({
            embeds: [
              embedTemplate()
                .setTitle("ok")
                .setDescription("everything was all fucked up ur welcome"),
            ],
          });
          process.exit();
      }
    }
	}
}
	*/
}

// slash commands
async function onInteraction(state: State, interaction: Interaction) {
  const { client, database, config } = state;

  if (!interaction.isCommand()) {
    if (interaction.isButton()) {
      // Handle moves.
      const team =
        interaction.channel!.id == config.ids.channelRedTeam
          ? Team.RED
          : interaction.channel!.id == config.ids.channelBlueTeam
          ? Team.BLUE
          : -1;
      await handlePlace(state, interaction, team);
    }
    return;
  }

  const { commandName } = interaction;

  switch (commandName) {
    case "ping":
      await interaction.reply("Pong!");
      break;
    case "server":
      await interaction.reply(
        `Server name: ${interaction.guild!.name}\nTotal members: ${
          interaction.guild!.memberCount
        }`
      );
      break;
    case "ekrem":
      await interaction.reply("ekrem");
      break;
    case "weather": {
      let city =
        (interaction.options.get("city")?.value as string) || "istanbul";
      let weather = (await getWeather(city)) as {
        location: {
          name: string;
          region: string;
          country: string;
          lat: number;
          lon: number;
          tz_id: string;
          localtime_epoch: number;
          localtime: string;
        };
        current: {
          last_updated_epoch: number;
          last_updated: string;
          temp_c: number;
          temp_f: number;
          is_day: number;
          condition: {
            text: string;
            icon: string;
            code: number;
          };
          wind_mph: number;
          wind_kph: number;
          wind_degree: number;
          wind_dir: string;
          pressure_mb: number;
          pressure_in: number;
          precip_mm: number;
          precip_in: number;
          humidity: number;
          cloud: number;
          feelslike_c: number;
          feelslike_f: number;
          vis_km: number;
          vis_miles: number;
          uv: number;
          gust_mph: number;
          gust_kph: number;
        };
      }; //);

      if (!weather) {
        await interaction.reply({
          embeds: [
            embedTemplate()
              .setTitle("API key invalid")
              .setDescription(
                "The API key is invalid or has expired. Let the bot owner know so he can fix it."
              )
              .setColor(0xff0000),
          ],
        });
        break;
      }

      // if city not found
      if (!weather.location || weather.location.name == "") {
        await interaction.reply({
          embeds: [
            embedTemplate()
              .setTitle("Error")
              .setDescription("City not found!")
              .setColor(0xff0000),
          ],
        });

        break;
      }

      let weatherDescription = `${weather.current.condition.text} in ${weather.location.name}, ${weather.location.region}, ${weather.location.country}`;

      /**
       * Takes a JSON object as input, and returns a human-readable string from that object.
       * @returns {string}
       */
      function formatWeather(weather: any) {
        let output = "";
        output += `**${weather.current.condition.text}**\n`;
        output += `${weather.current.temp_c}°C / ${weather.current.temp_f}°F\n`;
        output += `Wind: ${weather.current.wind_mph}mph / ${weather.current.wind_kph}kph ${weather.current.wind_dir}\n`;
        output += `Humidity: ${weather.current.humidity}%\n`;
        output += `Clouds: ${weather.current.cloud}%\n`;
        output += `UV Index: ${weather.current.uv}\n`;
        output += `Feels like: ${weather.current.feelslike_c}°C / ${weather.current.feelslike_f}°F\n`;
        output += `Visibility: ${weather.current.vis_km}km / ${weather.current.vis_miles}mi\n`;
        output += `Gust: ${weather.current.gust_mph}mph / ${weather.current.gust_kph}kph\n`;
        return output;
      }

      const getWeatherEmoji = (): string => {
        switch (weather.current.condition.text) {
          case "Sunny":
            return "☀️";
          case "Cloudy":
            return "☁️";
          case "Partly cloudy":
            return "🌥️";
          case "Mist":
            return "🌬️";
          case "Light rain":
            return "🌦️";
          case "Heavy rain":
            return "🌧️";
          case "Clear":
            return "🌞";
          case "Snow":
            return "❄️";
          case "Overcast":
            return "☁️";
          case "Thunderstorm":
            return "⛈️";
          case "Fog":
            return "🌫️";

          default:
            return "❓";
        }
      };
      let weatherEmoji = getWeatherEmoji();
      interaction.reply({
        embeds: [
          embedTemplate()
            .setTitle(
              `${weather.location.name}, ${weather.location.region}, ${weather.location.country}`
            )
            .setDescription(`${weatherEmoji} ${formatWeather(weather)}`),
        ],
      });
      break;
    }
    case "leaderboard": {
      let [lb, fields] = await query(
        state,
        "select * from users order by moves desc limit 20"
      ); // descending
      var leaderText = "";
      for (var i = 0; i < lb.length; i++) {
        leaderText += `#${i + 1} (with ${lb[i]["moves"]} moves) <@${
          lb[i]["user_id"]
        }>\n`;
      }

      let embed = embedTemplate()
        .setTitle("Leaderboard")
        .setDescription(leaderText);

      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "user": {
      let user = interaction.options.getUser("user");
      if (!user) user = interaction.user;

      let [lb, fields] = await query(
        state,
        `select moves from users where user_id = ${user.id}`
      );
      if (lb.length == 0) {
        await interaction.reply({
          embeds: [
            embedTemplate()
              .setTitle("Damn")
              .setDescription(`${user} hasn't played yet!`),
          ],
        });
      } else {
        await interaction.reply({
          embeds: [
            embedTemplate()
              .setTitle(`${user.username}'s moves`)
              .setDescription(
                `${user} has made ${lb[0]["moves"]} moves since joining this server.`
              ),
          ],
        });
      }
      break;
    }
    case "game": {
      let round_number = interaction.options.get("round_number")
        ?.value as number;
      let move_number = interaction.options.get("move_number")?.value as number;
      let finishedGame = false;
      if (move_number == null) {
        move_number = 9999999;
        finishedGame = true;
      } // if no move number was given, display the whole game

      const [moveResults] = await query(
        database,
        `select * from moves where round_number = ${round_number} and move_number < ${move_number} order by move_number asc`
      );
      if (move_number > moveResults.length) move_number = moveResults.length;

      let oldState = {
        board: state.board,
        roundNumber: state.roundNumber,
        moveNumber: state.moveNumber,
      };

      if (
        !round_number ||
        round_number < 1 ||
        move_number < 1 ||
        (state.roundNumber && round_number >= state.roundNumber)
      ) {
        await interaction.reply({
          embeds: [
            embedTemplate()
              .setTitle(
                `Can't get round ${round_number} ` +
                  (move_number < 1 ? `move ${move_number} ` : "") +
                  (!round_number || round_number < 1 || move_number < 1
                    ? ":nerd: ".repeat(3)
                    : ":confused:")
              )
              .setDescription(
                !round_number || round_number < 1 || move_number < 1
                  ? ":skull: ".repeat(20)
                  : `Round number ${round_number} has not been played/finished yet, sadly.`
              ),
          ],
          ephemeral: true,
        });
        break;
      }

      state.board = initBoard(config.width, config.height);
      state.roundNumber = round_number;
      state.moveNumber = move_number;

      for (const { column_number, color } of moveResults)
        await placePiece(state, column_number, color ? Team.BLUE : Team.RED);

      let embed = await getBoardEmbed(state, finishedGame, true, moveResults);

      state = Object.assign(state, oldState);

      await interaction.reply({ embeds: [embed] });
      break;
    }
    default:
      await interaction.reply("Unknown command");
      break;
  }
}

// register slash commands
async function registerSlashCommands(state: State) {
  const { client, database, config } = state;

  let commandList = [
    {
      name: "ping",
      description: "hmmmm I wonder what this does",
    },
    {
      name: "leaderboard",
      description: "Lists players with the most moves",
    },
    {
      name: "ekrem",
      description: "ekrem",
    },
    {
      name: "game",
      description: "Shows you a previous game",
      options: [
        {
          name: "round_number",
          description: "The round number of the game you want to see",
          // https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-type
          type: 4,
          required: true,
        },
        {
          name: "move_number",
          description:
            "The move number of the round you specified. If left blank you will see the whole game.",
          type: 4,
          required: false,
        },
      ],
    },
    {
      name: "user",
      description: "Shows how many moves you or a different user has made",
      options: [
        {
          name: "user",
          description:
            "The user you want to see. If left blank you will see your own move count.",
          type: 6,
          required: false,
        },
      ],
    },
    {
      name: "weather",
      description: "Shows the current weather in a city",
      options: [
        {
          name: "city",
          description: "The city you want to see the weather of",
          type: 3,
          required: true,
        },
      ],
    },
  ];

  // create multiple commands
  let data = await rest.put(
    Routes.applicationGuildCommands(client.user!.id, config.ids.guild),
    { body: commandList }
  );
  console.log(data);
}

async function handlePlace(
  state: State,
  interaction: Message | ButtonInteraction,
  team: Team
) {
  const { client, database, config } = state;
  let column: number;

  if (interaction instanceof Message) column = parseInt(interaction.content);
  else {
    let r = /r([\d]*)m([\d]*)c([\d]*)/g;

    let match = r.exec(interaction.customId);
    console.log(interaction);
    if (match == null) {
      await interaction.reply({
        content:
          "Something weird happened, I couldn't recognize that button. Perhaps you can try again?",
        ephemeral: true,
      });
      return;
    }
    let _, round, move;
    [_, round, move, column] = match.map((x) => parseInt(x));

    if (round != state.roundNumber || move != state.moveNumber) {
      /*
      await interaction.reply({
        content: "This board is too old, are you looking at the latest game?",
        ephemeral: true,
      });
			*/
      await interaction.update({ components: [] }); // remove buttons because they shouldn't be there
      return;
    }
  }
  if (isNaN(column) || column < 1 || column > 7) return;

  // TODO: Handle repeat moves.

  if (state.whoseTurn! != team && state.whoseTurn! != -1) {
    /*
    const name = ["Red", "Blue"][state.whoseTurn!];
    await interaction.reply({
      embeds: [embedTemplate().setTitle(`It's ${name} Team's turn!`)],
      ephemeral: true,
    });
		*/
    if (interaction instanceof ButtonInteraction) {
      await interaction.update({ components: [] }); // remove buttons because they shouldn't be there
    }
    return;
  }

  const piece = await placePiece(
    state,
    column - 1,
    team,
    interaction instanceof Message ? interaction.author.id : interaction.user.id
  );
  if (piece != null) {
    const embed = await getBoardEmbed(state);
    let embed_two: EmbedBuilder | null = null;
    let fourInARow = checkFourInARow(state.board!, [team]);

    if (fourInARow instanceof Array) {
      // Win detection.
      state.boardImportantCoords = new Set(
        fourInARow.map((coord) => coord.join(","))
      );
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
      embed_two = await getBoardEmbed(state);
    } else if (
      !checkFourInARow(state.board!, [-1, Team.RED]) &&
      !checkFourInARow(state.board!, [-1, Team.BLUE])
    ) {
      // Tie detection.
      embed.setTitle("Tie!! (╯°□°）╯︵ ┻━┻");

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
      embed_two = await getBoardEmbed(state);
    }

    let buttons = Array.from(Array(7).keys())
      .map((n) => n + 1)
      .map((n) =>
        new ButtonBuilder()
          .setEmoji(emojiNumbers[n - 1])
          .setCustomId(
            `r${state.roundNumber}m${state.moveNumber}c${n.toString()}`
          )
          .setStyle(ButtonStyle.Primary)
      );
    let components: Array<ActionRowBuilder> = Array.from(Array(2).keys()).map(
      () => new ActionRowBuilder()
    );
    let i = 0;
    buttons.forEach((button) => components[i++ % 2].addComponents(button));

    let embeds = embed_two ? [embed, embed_two] : [embed];
    let message = {
      embeds,
      components: components,
    } as MessageCreateOptions;

    if (interaction instanceof ButtonInteraction) {
      await interaction.update({ components: [] });
    }

    // remove buttons from both messages
    // this is a pretty botched solution, but it works
    if (oldRedMsg) await oldRedMsg.edit({ components: [] });
    if (oldBlueMsg) await oldBlueMsg.edit({ components: [] });

    if (state.whoseTurn != Team.BLUE)
      oldRedMsg = await state.channels?.redTeam!.send(message);
    else await state.channels?.redTeam!.send({ embeds });
    if (state.whoseTurn != Team.RED)
      oldBlueMsg = await state.channels?.blueTeam!.send(message);
    else await state.channels?.blueTeam!.send({ embeds });

    /* await interaction.reply({
      embeds: [
        embedTemplate()
          .setTitle("Success!")
          .setDescription("Your move has been placed!"),
      ],
      ephemeral: true,
    }); */

    // await state.ekremMessage!.edit({ embeds: [embed] });
  } else {
    await interaction.reply({
      embeds: [
        embedTemplate()
          .setTitle("Oh no!!")
          .setDescription(`That column is already full!`),
      ],
      ephemeral: true,
    });
  }
}

async function main(
  arguments_: string[],
  environment: typeof env
): Promise<number> {
  const activeConfig: Config = config.development;

  const client = new Client({
    intents: [3276799], // all intents
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

  const state: State = {
    database,
    client,
    config: activeConfig,
    boardImportantCoords: new Set(),
  };

  client.on("ready", () => onReady(state));

  await client.login(env["TOKEN"] || activeConfig.bot_token);
  rest.setToken(env["TOKEN"] || activeConfig.bot_token);

  await registerSlashCommands(state);
  handleMessages(state);
  handleInteractions(state);

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
