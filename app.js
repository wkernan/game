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
const io = require('socket.io')(serv, {});
io.sockets.on('connection', socket => {
	socket.id = Math.random();
	socket.x = 0;
	socket.y = 0;
	SOCKET_LIST[socket.id] = socket;

	socket.emit('serverMsg', {
		msg: `Player ${socket.id} has joined!`
	});
});

setInterval(() => {
	const pack = [];
	for(const i in SOCKET_LIST) {
		const socket = SOCKET_LIST[i];
		socket.x++;
		socket.y++;
		pack.push({
			x: socket.x,
			y: socket.y
		});
	};

	for(const i in SOCKET_LIST) {
		const socket = SOCKET_LIST[i];
		socket.emit('newPositions', pack);
	}

}, 1000/25);
