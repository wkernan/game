import express from 'express';
const app = express();
const serv = require('http').Server(app);

app.get('/', (req,res) => {
	res.sendFile(`${__dirname}/client/index.html`);
});

app.use('/client', express.static(`${__dirname}/client`));
app.set('port', process.env.PORT || 2000);
serv.listen(app.get('port'), () => {
	console.log(`Server listening on port ${app.get('port')}`);
});

const SOCKET_LIST = {};
const PLAYER_LIST = {};

const Player = id => {
	const self = {
		x: 250,
		y:250,
		id,
		number: `${Math.floor(10 * Math.random())}`,
		pressingLeft: false,
		pressingRight: false,
		pressingUp: false,
		pressingDown: false,
		maxSpd: 10
	}

	self.updatePosition = () => {
		if(self.pressingRight) 
			self.x += self.maxSpd;
		if(self.pressingLeft) 
			self.x -= self.maxSpd;
		if(self.pressingUp)
			self.y -= self.maxSpd;
		if(self.pressingDown)
			self.y += self.maxSpd;
	}

	return self;
};

const io = require('socket.io')(serv, {});
io.sockets.on('connection', socket => {
	socket.id = Math.random();
	socket.x = 0;
	socket.y = 0;
	socket.number = "" + Math.floor(10 * Math.random());
	SOCKET_LIST[socket.id] = socket;
	
	const player = Player(socket.id);
	PLAYER_LIST[socket.id] = player;

	socket.on('disconnect', () => {
		delete SOCKET_LIST[socket.id];
		delete PLAYER_LIST[socket.id];
	});

	socket.on('keyPress', data => {
		if(data.inputId === 'right')
			player.pressingRight = data.state;
		else if(data.inputId === 'left')
			player.pressingLeft = data.state;
		else if(data.inputId === 'down')
			player.pressingDown = data.state;
		else if(data.inputId === 'up')
			player.pressingUp = data.state;
	})

	socket.emit('serverMsg', {
		msg: `Player ${socket.id} has joined!`
	});
});

setInterval(() => {
	const pack = [];
	for(const i in PLAYER_LIST) {
		const player = PLAYER_LIST[i];
		player.updatePosition();
		pack.push({
			x: player.x,
			y: player.y,
			number: player.number
		});
	};

	for(const i in SOCKET_LIST) {
		const socket = SOCKET_LIST[i];
		socket.emit('newPositions', pack);
	}

}, 1000/25);
