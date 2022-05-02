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

const time = () => {
  // returns timestamp
  return new Date().getTime();
};

const emojiRegex =
  /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83c\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|[\ud83c\ude32-\ude3a]|[\ud83c\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/g;

async function addTroll(msg, contents) {
  let userID = contents.match(/[0-9]+/u);
  let emoji = contents.match(emojiRegex);

  if (emoji && emoji[0].length == 2) {
    if (!userID) {
      msg.reply({
        embeds: [
          embedTemplate()
            .setTitle("Error")
            .setDescription("No user ID provided."),
        ],
      });
      return;
    }

    let user = guild.members.cache.find(
      // find user by id
      (user) => user.id == userID
    );

    if (!user) {
      msg.reply({
        embeds: [
          embedTemplate().setTitle("Error").setDescription("User not found!"),
        ],
      });
      return;
    }
    let emojiNum = emoji[0].codePointAt(0);
    removeTroll(userID);
    await db.execQuery(
      `insert into troll (user_id, emoji) values (${userID}, ${emojiNum})`
    );

    msg.react("👍");
  } else {
    msg.reply({
      embeds: [
        embedTemplate().setTitle("Error").setDescription("No emoji provided."),
      ],
    });
  }
}

async function removeTroll(userID) {
  await db.execQuery(`delete from troll where user_id = ${userID}`);
}

async function getTroll(userID) {
  return await db.execQuery(`select * from troll where user_id = ${userID}`);
}

function embedTemplate() {
  return new MessageEmbed().setColor("RANDOM");
}

var guild;

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  guild = client.guilds.cache.get(global.guild);

  guild.voiceStates.cache.forEach(async (voiceState) => {
    await removeMute(voiceState.id);
  });
});

// constants
const codeEsc = "```";

client.on("messageCreate", async (msg, newMsg) => {
  if (!["DEFAULT", "REPLY"].includes(msg.type)) return; // no pinned messages/voice channels/weird channels!
  msg.edited = false;
  if (newMsg) {
    if (newMsg.content == msg.content) return; // no partial messages!
    msg = newMsg;
    msg.edited = true;
  }

  if (!msg.edited) {
    [results, fields] = await getTroll(msg.author.id);
    if (results.length > 0) {
      results = results[0];
      var emoji = Number(results.emoji);
      emoji = String.fromCodePoint(emoji);
      msg.react(emoji);
    }
  }

  if (msg.partial) {
    msg = await msg.fetch();
  }

  if (
    msg.author.bot || // no bots!
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

        switch (command) {
          case "troll":
            await addTroll(msg, contents);
            break;
          case "untroll":
            let userID = contents.match(/[0-9]+/u);
            if (userID) {
              removeTroll(userID);
              msg.react("👍");
            }
            break;
        }
      }
    }

    if (admins.includes(msg.author.id)) {
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
      }
    }
  }
});

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  // very useful
  return new Promise((resolve) => setTimeout(resolve, ms));
}
