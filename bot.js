const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const ALLOWED_ROLE_ID = "1513159020897243247";
const ALLOWED_CHANNEL_ID = "1513165818744148040";

function hasPermission(message) {
    if (message.channel.id !== ALLOWED_CHANNEL_ID) return false;
    if (!message.member.roles.cache.has(ALLOWED_ROLE_ID)) return false;
    return true;
}

const DB_FILE = './cs2_users.json';
let users = {};

function loadDB() {
    if (fs.existsSync(DB_FILE)) users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4)); }
loadDB();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/api/cs2/login', (req, res) => {
    const { username, password, hwid } = req.body;
    if (!users[username]) return res.json({ success: false, message: 'Benutzer nicht gefunden!' });
    const user = users[username];
    if (user.password !== password) return res.json({ success: false, message: 'Falsches Passwort!' });
    if (user.hwid === "") { user.hwid = hwid; saveDB(); }
    else if (user.hwid !== hwid) return res.json({ success: false, message: 'Lizenz an andere HWID gebunden!' });
    if (user.expires_at < Date.now()) return res.json({ success: false, message: 'Lizenz abgelaufen!' });
    res.json({ success: true, message: 'CS2 Login erfolgreich', token: `CS2-${Date.now()}`, user: { username, rank: user.rank, days_left: Math.ceil((user.expires_at - Date.now()) / 86400000) } });
});

app.get('/health', (req, res) => res.json({ status: 'online' }));
app.listen(3000, () => console.log('CS2 API läuft'));

client.on('ready', () => console.log(`✅ CS2 Bot eingeloggt als ${client.user.tag}`));
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    if (!hasPermission(message)) return message.reply('❌ Keine Berechtigung!').then(m => setTimeout(() => m.delete(), 5000));
    
    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    
    if (cmd === 'cs2createuser') {
        const [name, pass, days] = args;
        if (!name || !pass || !days) return message.reply('!cs2createuser <name> <pass> <tage>');
        if (users[name]) return message.reply('Benutzer existiert!');
        users[name] = { password: pass, rank: 'CS2 Premium', hwid: '', created_by: message.author.tag, expires_at: Date.now() + parseInt(days) * 86400000 };
        saveDB();
        message.reply(`✅ CS2 User ${name} erstellt f�r ${days} Tage!`);
    }
    
    if (cmd === 'cs2deleteuser') {
        if (!args[0]) return message.reply('!cs2deleteuser <name>');
        if (!users[args[0]]) return message.reply('Benutzer nicht gefunden!');
        delete users[args[0]];
        saveDB();
        message.reply(`✅ CS2 User ${args[0]} gelöscht!`);
    }
    
    if (cmd === 'cs2addtime') {
        const [name, days] = args;
        if (!name || !days) return message.reply('!cs2addtime <name> <tage>');
        if (!users[name]) return message.reply('Benutzer nicht gefunden!');
        users[name].expires_at += parseInt(days) * 86400000;
        saveDB();
        message.reply(`✅ ${name} +${days} Tage verlängert!`);
    }
    
    if (cmd === 'cs2resetuser') {
        if (!args[0]) return message.reply('!cs2resetuser <name>');
        if (!users[args[0]]) return message.reply('Benutzer nicht gefunden!');
        users[args[0]].hwid = '';
        saveDB();
        message.reply(`✅ HWID von ${args[0]} zurückgesetzt!`);
    }
    
    if (cmd === 'cs2users') {
        const list = Object.entries(users).map(([n, d]) => `${d.expires_at > Date.now() ? '🟢' : '🔴'} ${n} | ${d.hwid ? '🔒' : '⚪'}`).join('\n');
        message.reply({ embeds: [new EmbedBuilder().setTitle('CS2 Benutzer').setColor(0x9C27B0).setDescription(list || 'Keine User')] });
    }
});

client.login(process.env.DISCORD_TOKEN);
