const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ============== KONFIGURATION ==============
const ALLOWED_ROLE_ID = "1513159020897243247";
const ALLOWED_CHANNEL_ID = "1513165818744148040";

function hasPermission(message) {
    if (message.channel.id !== ALLOWED_CHANNEL_ID) return false;
    if (!message.member.roles.cache.has(ALLOWED_ROLE_ID)) return false;
    return true;
}

// ============== DATENBANK ==============
const DB_FILE = './cs2_users.json';
let users = {};

function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log(`📦 Geladene CS2 Benutzer: ${Object.keys(users).length}`);
    }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
}

loadDB();

// ============== EXPRESS API für CS2 Cheat ==============
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ========== CS2 LOGIN ENDPOINT ==========
app.post('/api/cs2/login', (req, res) => {
    console.log('📝 CS2 Login request received');
    console.log('Body:', req.body);
    
    const { username, password, hwid } = req.body;
    
    if (!username || !password) {
        return res.json({ success: false, message: 'Benutzername und Passwort erforderlich!' });
    }
    
    if (!users[username]) {
        return res.json({ success: false, message: 'Benutzer nicht gefunden!' });
    }
    
    const user = users[username];
    
    if (user.password !== password) {
        return res.json({ success: false, message: 'Falsches Passwort!' });
    }
    
    if (user.hwid === "") {
        user.hwid = hwid;
        saveDB();
        console.log(`🔒 HWID gebunden an ${username} (CS2)`);
    } else if (user.hwid !== hwid) {
        return res.json({ success: false, message: 'Diese Lizenz ist an eine andere HWID gebunden!' });
    }
    
    if (user.expires_at && user.expires_at < Date.now()) {
        return res.json({ success: false, message: 'Lizenz abgelaufen! Kontaktiere den Support.' });
    }
    
    const daysLeft = Math.ceil((user.expires_at - Date.now()) / (1000 * 60 * 60 * 24));
    
    const response = {
        success: true,
        message: 'CS2 Login erfolgreich',
        token: `CS2-${Date.now()}-${username}`,
        user: {
            username: username,
            rank: user.rank,
            expires_at: user.expires_at,
            days_left: daysLeft
        }
    };
    
    console.log('✅ CS2 Login erfolgreich:', username);
    res.json(response);
});

// Status Endpoint
app.get('/api/cs2/status', (req, res) => {
    const totalUsers = Object.keys(users).length;
    const activeUsers = Object.values(users).filter(u => u.expires_at > Date.now()).length;
    res.json({ 
        online: true, 
        game: "CS2",
        totalUsers, 
        activeUsers, 
        timestamp: Date.now(),
        version: '1.0.0'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'online', uptime: process.uptime() });
});

app.get('/', (req, res) => {
    res.json({ 
        name: 'Enox CS2 API', 
        status: 'online',
        endpoints: ['POST /api/cs2/login', 'GET /api/cs2/status', 'GET /health']
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ CS2 API läuft auf Port ${PORT}`));

// ============== DISCORD BOT COMMANDS für CS2 ==============
const PREFIX = '!';

client.on('ready', () => {
    console.log(`✅ CS2 Bot eingeloggt als ${client.user.tag}`);
    console.log(`📢 CS2 Befehle nur in Channel ID: ${ALLOWED_CHANNEL_ID}`);
    console.log(`👑 Benötigte Rolle ID: ${ALLOWED_ROLE_ID}`);
    client.user.setActivity('CS2 Cheat System', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    
    if (!hasPermission(message)) {
        const wrongChannelMsg = message.channel.id !== ALLOWED_CHANNEL_ID 
            ? `❌ CS2 Befehl nur in <#${ALLOWED_CHANNEL_ID}> erlaubt!` 
            : `❌ Du hast keine Berechtigung für diesen CS2 Befehl!`;
        return message.reply(wrongChannelMsg).then(msg => {
            setTimeout(() => msg.delete(), 5000);
            if (message.channel.id !== ALLOWED_CHANNEL_ID) message.delete();
        });
    }
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // ========== !cs2createuser ==========
    if (command === 'cs2createuser') {
        const username = args[0];
        const password = args[1];
        const days = parseInt(args[2]);
        
        if (!username || !password || !days) {
            return message.reply('✅ !cs2createuser <Benutzername> <Passwort> <Tage>\n📝 Beispiel: !cs2createuser CS2Player Pass123 30');
        }
        
        if (users[username]) {
            return message.reply('❌ CS2 Benutzer existiert bereits!');
        }
        
        const expires_at = Date.now() + (days * 24 * 60 * 60 * 1000);
        const expireDate = new Date(expires_at).toLocaleString('de-DE');
        
        users[username] = {
            password: password,
            rank: 'CS2 Premium',
            hwid: '',
            game: 'CS2',
            created_by: message.author.tag,
            created_at: Date.now(),
            expires_at: expires_at
        };
        
        saveDB();
        
        const embed = new EmbedBuilder()
            .setTitle('✅ CS2 Benutzer erstellt')
            .setColor(0x9C27B0)
            .addFields(
                { name: '🎮 Spiel', value: 'Counter-Strike 2', inline: true },
                { name: '👤 Benutzername', value: `\`${username}\``, inline: true },
                { name: '🔑 Passwort', value: `||${password}||`, inline: true },
                { name: '📅 Gültig bis', value: expireDate, inline: true },
                { name: '⏰ Tage', value: `${days} Tage`, inline: true },
                { name: '🛡️ Rang', value: 'CS2 Premium', inline: true }
            )
            .setFooter({ text: 'Enox CS2 Cheat System • HWID Lock aktiv' })
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }
    
    // ========== !cs2deleteuser ==========
    if (command === 'cs2deleteuser') {
        const username = args[0];
        if (!username) return message.reply('✅ !cs2deleteuser <Benutzername>');
        if (!users[username]) return message.reply('❌ CS2 Benutzer nicht gefunden!');
        delete users[username];
        saveDB();
        message.reply(`✅ CS2 Benutzer **${username}** wurde gelöscht!`);
    }
    
    // ========== !cs2addtime ==========
    if (command === 'cs2addtime') {
        const username = args[0];
        const days = parseInt(args[1]);
        if (!username || !days) return message.reply('✅ !cs2addtime <Benutzername> <Tage>');
        if (!users[username]) return message.reply('❌ CS2 Benutzer nicht gefunden!');
        users[username].expires_at += (days * 24 * 60 * 60 * 1000);
        saveDB();
        message.reply(`✅ CS2 **${username}** +${days} Tage verlängert!`);
    }
    
    // ========== !cs2resetuser ==========
    if (command === 'cs2resetuser') {
        const username = args[0];
        if (!username || !users[username]) return message.reply('❌ CS2 Benutzer nicht gefunden!');
        users[username].hwid = '';
        saveDB();
        message.reply(`✅ CS2 HWID von **${username}** wurde zurückgesetzt!`);
    }
    
    // ========== !cs2users ==========
    if (command === 'cs2users') {
        const userList = Object.entries(users).map(([name, data]) => {
            const status = data.expires_at > Date.now() ? '🟢' : '🔴';
            const hwid_status = data.hwid ? '🔒' : '⚪';
            const daysLeft = Math.ceil((data.expires_at - Date.now()) / (1000 * 60 * 60 * 24));
            return `${status} **${name}** | ${hwid_status} | ${daysLeft} Tage`;
        }).join('\n');
        const embed = new EmbedBuilder()
            .setTitle('🎮 CS2 Benutzerliste')
            .setColor(0x9C27B0)
            .setDescription(userList || 'Keine CS2 Benutzer')
            .setFooter({ text: `Total: ${Object.keys(users).length} CS2 User` });
        message.reply({ embeds: [embed] });
    }
    
    // ========== !cs2stats ==========
    if (command === 'cs2stats') {
        const total = Object.keys(users).length;
        const active = Object.values(users).filter(u => u.expires_at > Date.now()).length;
        const bound = Object.values(users).filter(u => u.hwid !== '').length;
        const embed = new EmbedBuilder()
            .setTitle('📊 CS2 Cheat Statistiken')
            .setColor(0x9C27B0)
            .addFields(
                { name: '🎮 Spiel', value: 'Counter-Strike 2', inline: true },
                { name: '👥 Total Benutzer', value: `${total}`, inline: true },
                { name: '🟢 Aktiv', value: `${active}`, inline: true },
                { name: '🔴 Abgelaufen', value: `${total - active}`, inline: true },
                { name: '🔒 HWID Gebunden', value: `${bound}`, inline: true },
                { name: '⚪ Frei', value: `${total - bound}`, inline: true }
            )
            .setFooter({ text: 'Enox CS2 Cheat System' });
        message.reply({ embeds: [embed] });
    }
    
    // ========== !cs2help ==========
    if (command === 'cs2help') {
        const embed = new EmbedBuilder()
            .setTitle('🎮 Enox CS2 Bot Commands')
            .setColor(0x9C27B0)
            .setDescription('**🔐 CS2 Admin Commands**')
            .addFields(
                { name: '!cs2createuser <name> <pass> <tage>', value: 'Erstellt CS2 Benutzer', inline: false },
                { name: '!cs2deleteuser <name>', value: 'Löscht CS2 Benutzer', inline: false },
                { name: '!cs2addtime <name> <tage>', value: 'Verlängert CS2 Lizenz', inline: false },
                { name: '!cs2resetuser <name>', value: 'Setzt CS2 HWID zurück', inline: false },
                { name: '!cs2users', value: 'Zeigt alle CS2 Benutzer', inline: false },
                { name: '!cs2stats', value: 'Zeigt CS2 Statistiken', inline: false }
            )
            .setFooter({ text: 'Enox CS2 Cheat System • Premium Protection' });
        message.reply({ embeds: [embed] });
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN nicht gesetzt!');
    process.exit(1);
}

client.login(TOKEN);
