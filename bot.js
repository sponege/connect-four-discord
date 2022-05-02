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

async function addMute(userID, setMute) {
  await removeMute(userID, false);

  await db.execQuery(
    `insert into mutes (user_id, ts) values (${userID}, ${time()})`
  );

  let user = guild.members.cache.find(
    // find user by id
    (user) => user.id == userID
  );

  if (setMute) user.voice.setMute(true);
}

async function removeMute(userID, setMute) {
  [results, fields] = await getMute(userID);

  if (results.length > 0) {
    var ts = Number(results.ts);
    if (ts + global.mute_time > time()) return; // if mute is still going on, dont unmute them
  }

  await db.execQuery(`delete from mutes where user_id = ${userID}`);

  console.log(results);

  let user = guild.members.cache.find(
    // find user by id
    (user) => user.id == userID
  );

  if (setMute) user.voice.setMute(false);
}

async function getMute(userID) {
  return await db.execQuery(`select * from mutes where user_id = ${userID}`);
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

client.on("voiceStateUpdate", async (oldState, newState) => {
  let user = client.users.cache.find(
    // find user by id
    (user) => user.id == newState.id
  );

  if (newState.serverMute) {
    await addMute(user.id, false);
    await sleep(global.mute_time);
    await removeMute(user.id, true);
  }
});

client.on("messageCreate", async (msg) => {
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
  }

  if (msg.content.toLowerCase().startsWith(global.prefix)) {
    // only process messages with command prefix
    var command = msg.content.split(" ")[0].substr(global.prefix.length);
    var op = msg.content.split(" "); // operands
    var contents = msg.content.substr(
      msg.content.indexOf(op[0]) + op[0].length + 1
    );

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
      case "unmute":
        await removeMute(msg.author.id);
    }

    if (msg.channel.type != "DM") {
      var user = msg.guild.members.cache.find(
        (member) => member.id == msg.author.id
      );
      if (user.permissions.has("MANAGE_MESSAGES")) {
        // commands for server moderators

        switch (command) {
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
