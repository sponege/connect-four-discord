const { Client, Intents, MessageEmbed } = require("discord.js");
const client = new Client({
  intents: new Intents(32767), // all intents
  partials: [
    "CHANNEL", // Required to receive DMs
  ],
});

require("./config"); // bot configuration
var db = require("./db"); // database init

client.login(process.env["TOKEN"] || global.bot_token);

function embedTemplate() {
  return new MessageEmbed().setColor("RANDOM");
}

async function blacklistPlayer(user_id) {
  await db.execQuery(`insert into blacklist (user_id) values (${user_id})`);
}

async function unblacklistPlayer(user_id) {
  await db.execQuery(`delete from blacklist where user_id = ${user_id}`);
}

async function isBlacklisted(user_id) {
  [results, fields] = await db.execQuery(
    `select * from blacklist where user_id = ${user_id}`
  );
  return results.length > 0;
}

function* range(to) {
  for (let index = 0; to > index; index++) yield index;
}

function* range2d(coords) {
  const [x, y] = coords;

  for (let xIndex of range(x))
    for (let yIndex of range(y)) yield [xIndex, yIndex];
}

function checkFourInARow(colors) {
  const [w, h] = [global.width, global.height];

  function check(x, y) {
    return colors.includes(board[y][x]);
  }

  // --x-
  // --x-
  // --x-
  // --x-

  // Downwards
  for (let [x, y] of range2d([w, h - 3]))
    if (check(x, y + 3) && check(x, y + 2) && check(x, y + 1) && check(x, y))
      return true;

  // ----
  // ----
  // xxxx
  // ----

  // Rightwards
  for (let [x, y] of range2d([w - 3, h]))
    if (check(x + 3, y) && check(x + 2, y) && check(x + 1, y) && check(x, y))
      return true;

  // Diagnonal
  for (let [x, y] of range2d([w - 3, h - 3])) {
    // ---x
    // --x-
    // -x--
    // x---

    if (
      check(x + 3, y + 3) &&
      check(x + 2, y + 2) &&
      check(x + 1, y + 1) &&
      check(x, y)
    )
      return true;

    // x---
    // -x--
    // --x-
    // $--x

    if (
      check(x + 3, y) &&
      check(x + 2, y + 1) &&
      check(x + 1, y + 2) &&
      check(x, y + 3)
    )
      return true;
  }

  return false;
}

async function getWins() {
  [results, fields] = await db.execQuery(`select red, blue from wins`);
  if (results.length == 0) {
    global.roundNum = 1;
    // await updateMsg();
    await db.execQuery(`insert into wins (red, blue) values (0, 0)`);
    global = { ...global, red: 0, blue: 0 };
  } else {
    result = results[0];
    global = { ...global, ...result };
  }
}

var board = null;
// i love sponege feet
// @danii
async function initBoard() {
  if (!board) {
    board = [];
    row = [];
    for (var i = 0; i < global.width; i++) {
      // 7 columns
      row.push(0);
    }
    for (var i = 0; i < global.height; i++) {
      // 6 rows
      board.push(JSON.parse(JSON.stringify(row)));
    }
  }
}

const time = () => {
  // returns timestamp
  return Date.now();
};

async function placePiece(x, color, msg) {
  // column, color
  // returns if place was successful
  var y = 0;
  while (true) {
    if (y + 2 > board.length || board[y + 1][x] != 0) {
      // if reach bottom or touch checker
      if (board[y][x] != 0) {
        return [false];
      }
      board[y][x] = color;
      if (msg) {
        await db.execQuery(
          `insert into moves (round_number, move_number, column_number, color, user_id, ts) values (${
            global.round_number
          }, ${global.move_number}, ${x}, ${color}, ${
            msg.author.id
          }, ${time()})`
        );
        await db.execQuery(`update state set move_number = move_number + 1`); // increment round number
        global.move_number++;
        var newTurn = Number(msg.channel.id == global.channels.redTeam.id); // other teams turn now
        await db.execQuery(`update state set whose_turn = ${newTurn}`);
        global.whose_turn = newTurn;

        [results, fields] = await db.execQuery(
          `select user_id from users where user_id = ${msg.author.id}`
        );
        if (results.length == 0) {
          await db.execQuery(
            `insert into users (user_id, moves) values (${msg.author.id}, 1)`
          );
        } else {
          await db.execQuery(
            `update users set moves = moves + 1 where user_id = ${msg.author.id}`
          );
        }
      }
      return [true, y];
    }
    y++;
  }
}

async function getBoardEmbed() {
  await initBoard();
  var embed = embedTemplate();
  var boardEmoji = "";
  var emojiNums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"];
  for (var i = 0; i < 7; i++) {
    boardEmoji += `${emojiNums[i]}`;
  }
  boardEmoji += "\n";
  for (var y = 0; y < board.length; y++) {
    for (var x = 0; x < board[y].length; x++) {
      boardEmoji += ["⚪", "🔴", "🔵"][board[y][x]];
    }
    boardEmoji += "\n";
  }

  embed.setDescription(boardEmoji);

  var team = ["Red", "Blue"][global.whose_turn];
  if (!team) team = "Any";

  embed.setTitle(`${team} Team's Turn!`);

  return embed;
}

async function updateEmbedWithDescription(embed) {
  await getState();
  [results, fields] = await db.execQuery(
    `select * from moves where round_number = ${global.round_number} order by move_number desc limit 1`
  );

  var add = ""; // text to add

  function setAdd(result) {
    add = [
      `Round ${result.round_number}`,
      `Move ${result.move_number}`,

      result.user_id
        ? `Last move by <@${result.user_id}>`
        : `Join a team at <#${global.channels.chooseTeam.id}> and start a new game!`,
      `Wins:`,
      `Red Team - ${global.red}`,
      `Blue Team - ${global.blue}`,
    ].join("\n");
  }

  if (results.length > 0) {
    result = results[0];
    setAdd(result);
  } else {
    [results, fields] = await db.execQuery(
      `select * from moves where round_number = ${
        global.round_number - 1
      } order by move_number desc limit 1`
    );
    setAdd(result);
  }

  return embed.setDescription(embed.description + "\n" + add);
}

async function updateEkrem() {
  await global.msg.edit({
    embeds: [await updateEmbedWithDescription(await getBoardEmbed())],
  });
}

async function getState() {
  var update = false;
  [results, fields] = await db.execQuery("select * from state");
  if (results.length == 0) {
    update = true;
    console.log(ekrem);
    global.msg = await ekrem.send({
      embeds: [
        embedTemplate()
          .setTitle("lol")
          .setDescription("ur not supposed to see this lol"),
      ],
    });
    [results, fields] = await db.execQuery(
      `insert into state (msg_id, round_number, move_number, whose_turn) values (${global.msg.id}, 1, 1, -1)`
    );
    global.round_number = 1;
    global.move_number = 1;
    global.whose_turn = -1;
  } else {
    result = results[0];
    try {
      global.msg = await ekrem.messages.fetch(result.msg_id);
    } catch (e) {
      global.msg = await ekrem.send({
        embeds: [
          embedTemplate()
            .setTitle("lol")
            .setDescription("ur not supposed to see this lol"),
        ],
      });
      [results, fields] = await db.execQuery(
        `update state set msg_id = ${global.msg.id}`
      );
      update = true;
    }
    global = { ...global, ...result };
  }
  if (update) {
    [results, fields] = await db.execQuery(
      `select * from moves where round_number = ${global.round_number}`
    );
    for (result of results) {
      [results, fields] = await db.execQuery(
        `select * from moves where round_number = ${global.round_number}`
      );
      await placePiece(result.column_number, result.color);
    }
    await updateEkrem();
  }

  return update;
}

var guild, ekrem;
var queue = [];

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  guild = client.guilds.cache.get(global.guild);
  ekrem = guild.channels.cache.get(global.ekrem);

  global.channels = {};
  global.roles = {};

  for (channelName of Object.entries(global.channelNames)) {
    console.log(channelName);
    global.channels[channelName[0]] = guild.channels.cache.find(
      (channel) => channel.name == channelName[1]
    );
  }

  await initBoard();

  var update = await getState();
  await getWins();

  if (!update) {
    [results, fields] = await db.execQuery(
      `select * from moves where round_number = ${global.round_number}`
    );
    for (result of results) {
      await placePiece(result.column_number, result.color);
    }
  }

  if (update) await updateEkrem();

  for (roleName of Object.entries(global.roleNames)) {
    console.log(roleName);
    global.roles[roleName[0]] = guild.roles.cache.find(
      (role) => role.name == roleName[1]
    );
  }

  while (true) {
    for ([msg, newMsg] of queue) {
      await processMsg(msg, newMsg, repeat);
    }
    queue = [];
    await sleep(100);
  }
});

// constants
const codeEsc = "```";

// red: 0
// blue: 1

var repeat = { user_id: 0, times: 0 };
const processMsg = async (msg, newMsg, repeat) => {
  if (!["DEFAULT", "REPLY"].includes(msg.type)) return; // no pinned messages/voice channels/weird channels!
  msg.edited = false;
  if (newMsg) {
    if (newMsg.content == msg.content) return; // no partial messages!
    msg = newMsg;
    msg.edited = true;
  }

  if (msg.author.bot) return; // no bots!

  placePiece: if (!msg.edited) {
    var color; // color of piece to place
    // 0: empty
    // 1: red
    // 2: blue
    if (msg.channel.name == global.channelNames.redTeam) {
      color = 1;
    } else if (msg.channel.name == global.channelNames.blueTeam) {
      color = 2;
    } else {
      break placePiece; // break from place piece "function", because we're not supposed to if it's not in the right channel
    }

    var column = Number(msg.content);
    if (!(column && column > 0 && column <= 7)) break placePiece;

    if (await isBlacklisted(msg.author.id)) {
      var user = msg.guild.members.cache.find(
        (member) => member.id == msg.author.id
      );
      await user.roles.remove(global.roles.redTeam);
      await user.roles.remove(global.roles.blueTeam);
      await user.send({
        embeds: [
          embedTemplate()
            .setTitle("You are blacklisted!")
            .setDescription("Ask a mod to remove you from the blacklist!"),
        ],
      });
      break placePiece;
    } // no blacklisted players :)

    if (repeat.user_id != msg.author.id) {
      repeat.times = 0;
      repeat.user_id = msg.author.id;
    } else {
      repeat.times++;
    }

    if (repeat.times > 1) {
      if (repeat.times >= global.spamBlacklistCount) {
        await blacklistPlayer(msg.author.id);
        await msg.reply({
          embeds: [
            embedTemplate()
              .setTitle("You have been blacklisted.")
              .setDescription("Good fucking riddance."),
          ],
        });
      } else {
        await msg.reply({
          embeds: [
            embedTemplate()
              .setTitle("Please don't spam connect 4 moves!!")
              .setDescription("Else you will be blacklisted!!"),
          ],
        });
      }
      break placePiece;
    }

    if (!(global.whose_turn != !(color - 1))) {
      // if it is other teams turn
      var team = ["Red", "Blue"][global.whose_turn];
      if (!team) team = "Any";
      msg.reply({
        embeds: [
          embedTemplate()
            .setTitle("Hold your horses!!")
            .setDescription(`It is ${team} Teams turn!`),
        ],
      });
      break placePiece;
    }

    column--;
    [piecePlaced, y] = await placePiece(column, color, msg);
    if (piecePlaced) {
      var embed = await getBoardEmbed();
      var win = await checkFourInARow([color]);

      if (win) {
        embed.setTitle(
          `${
            ["Blue", "Red"][global.whose_turn]
          } Team Wins! (anyone can start a new game)`
        );
        await db.execQuery(`update state set round_number = round_number + 1`); // increment round number
        global.round_number++;

        await db.execQuery(`update state set move_number = 1`);
        global.move_number = 1;

        var winningTeam = ["blue", "red"][global.whose_turn];
        await db.execQuery(
          `update wins set ${winningTeam} = ${winningTeam} + 1`
        );
        global[winningTeam]++;

        board = null;
        await db.execQuery(`update state set whose_turn = -1`);
        global.whose_turn = -1;
      } else {
        var possible = checkFourInARow([0, 1]) || checkFourInARow([0, 2]);

        if (!possible) {
          embed.setTitle(`Tie (anyone can start a new game)`);
          await db.execQuery(
            `update state set round_number = round_number + 1`
          ); // increment round number
          global.round_number++;

          await db.execQuery(`update state set move_number = 1`);
          global.move_number = 1;
        }
      }
      embed = await updateEmbedWithDescription(embed);
      embed = { embeds: [embed] };
      global.channels.redTeam.send(embed);
      global.channels.blueTeam.send(embed);
      await updateEkrem();
    } else {
      msg.channel.send({
        embeds: [
          embedTemplate()
            .setTitle("Oh no!!")
            .setDescription("That column is already full!"),
        ],
      });
    }
  }

  if (msg.partial) {
    msg = await msg.fetch();
  }

  if (
    !(
      msg.channel.type == "DM" ||
      msg.guild.me.permissionsIn(msg.channel).has("SEND_MESSAGES")
    ) // if you don't have permission to send messages then dont
  ) {
    return 0;
  } // only process messages with command prefix
  var command = msg.content.split(" ")[0].substr(global.prefix.length);

  if (!global.commands[command] && !global.admin_commands[command]) return; // only use commands in config
  var op = msg.content.split(" "); // operands
  var contents = msg.content.substr(
    msg.content.indexOf(op[0]) + op[0].length + 1
  );

  if (msg.content.toLowerCase().startsWith(global.prefix)) {
    switch (
      command // commands for everyone
    ) {
      case "top":
        // sort by number of credits
        [lb, fields] = await db.execQuery(
          "select * from users order by moves desc limit 10"
        ); // descending
        var leaderText = "";
        for (var i = 0; i < lb.length; i++) {
          leaderText += `#${i + 1}: <@${lb[i]["user_id"]}> Moves: ${
            lb[i]["moves"]
          }\n`;
        }

        var embed = new MessageEmbed()
          .setColor("RANDOM")
          .setTitle("Leaderboard")
          .setDescription(leaderText);

        msg.channel.send({ embeds: [embed] });

        break;

      case "help":
        if (global.admins.includes(msg.author.id) || op[1] != "admin") {
          var embed = embedTemplate()
            .setTitle(global.title)
            .setDescription(global.description);
          for (command of Object.entries(
            op[1] == "admin" ? global.admin_commands : global.commands
          )) {
            embed = embed.addField(global.prefix + command[0], command[1]);
          }
          await msg.channel.send({ embeds: [embed] });
        } else {
          await msg.channel.send({
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
        if (global.admins.includes(msg.author.id)) {
          var embed = embedTemplate()
            .setTitle(global.title)
            .setDescription(global.description);
          for (command of Object.entries(global.admin_commands)) {
            embed = embed.addField(global.prefix + command[0], command[1]);
          }
          await msg.channel.send({ embeds: [embed] });
        } else {
          await msg.channel.send({
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
        var response = await msg.channel.send(
          contents ? contents : "You must supply a message to echo."
        );
        // await sleep(5000);
        // msg.delete();
        // response.delete();
        break;
    }

    if (msg.channel.type != "DM") {
      var user = msg.guild.members.cache.find(
        (member) => member.id == msg.author.id
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
      // (admins.includes(msg.author.id)) {
      // commands for bot owners
      switch (command) {
        case "list":
          var messages = [];
          client.guilds.cache.forEach(async (guild) => {
            messages.push(
              await msg.channel.send({
                embeds: [
                  new MessageEmbed()
                    .setColor("RANDOM")
                    .setTitle(guild.name)
                    .setDescription(
                      [
                        `Members: ${guild.memberCount}`,
                        `ID: ${guild.id}`,
                        `Permissions: ${codeEsc}${guild.me.permissions.toArray()}${codeEsc}`,
                      ].join("\n")
                    )
                    .setThumbnail(guild.iconURL()),
                ],
              })
            );
          });
          /**
          await sleep(5000);
          msg.delete();
          for (m of messages) {
            m.delete();
          }
          **/
          break;
        case "reset":
          global.msg.delete();
          await db.execQuery(`truncate users`);
          await db.execQuery(`truncate wins`);
          await db.execQuery(`truncate moves`);
          await db.execQuery(`truncate state`);
          await msg.channel.send({
            embeds: [
              embedTemplate()
                .setTitle("ok")
                .setDescription("everything was all fucked up ur welcome"),
            ],
          });
          process.exit();
        case "blacklist":
          var user_id = contents.match(/[0-9]+/u);
          if (!user_id) {
            msg.reply({
              embeds: [
                embedTemplate()
                  .setTitle("Error")
                  .setDescription("No user ID provided."),
              ],
            });
            break;
          }

          var user = guild.members.cache.find(
            // find user by id
            (user) => user.id == user_id
          );
          if (!user) {
            msg.reply({
              embeds: [
                embedTemplate()
                  .setTitle("Error")
                  .setDescription("User not found!"),
              ],
            });
            break;
          }

          if (await isBlacklisted(user.id)) {
            msg.reply({
              embeds: [
                embedTemplate()
                  .setTitle("Error")
                  .setDescription("User is already blacklisted!"),
              ],
            });
            break;
          }

          await blacklistPlayer(user.id);

          msg.reply({
            embeds: [
              embedTemplate().setDescription(`Blacklisted <@${user.id}>`),
            ],
          });
          break;
        case "unblacklist":
          var user_id = contents.match(/[0-9]+/u);
          if (!user_id) {
            msg.reply({
              embeds: [
                embedTemplate()
                  .setTitle("Error")
                  .setDescription("No user ID provided."),
              ],
            });
            break;
          }

          var user = guild.members.cache.find(
            // find user by id
            (user) => user.id == user_id
          );
          if (!user) {
            msg.reply({
              embeds: [
                embedTemplate()
                  .setTitle("Error")
                  .setDescription("User not found!"),
              ],
            });
            break;
          }

          await unblacklistPlayer(user.id);

          msg.reply({
            embeds: [
              embedTemplate().setDescription(
                `Removed <@${user.id}> from blacklist`
              ),
            ],
          });
          break;
      }
    }
  }
};

client.on("messageCreate", (msg, newMsg) => {
  queue.push([msg, newMsg]);
});

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  // very useful
  return new Promise((resolve) => setTimeout(resolve, ms));
}
