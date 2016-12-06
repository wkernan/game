import express from 'express';
const app = express();
const serv = require('http').Server(app);
const mongoose = require('mongoose');
var db = require('./config/database');
var User = require('./models/User');
const bcrypt = require('bcryptjs');

mongoose.connect(db.url);

app.get('/', (req,res) => {
	res.sendFile(`${__dirname}/client/index.html`);
});

app.use('/client', express.static(`${__dirname}/client`));
app.set('port', process.env.PORT || 2000);
serv.listen(app.get('port'), () => {
	console.log(`Server listening on port ${app.get('port')}`);
});

const SOCKET_LIST = {};

const Entity = () => {
	const self = {
		x: 250,
		y: 250,
		spdX: 0,
		spdY: 0,
		id:""
	}

	self.update = () => {
		self.updatePosition();
	}

	self.updatePosition = () => {
		self.x += self.spdX;
		self.y += self.spdY;
	}

	self.getDistance = pt => {
		return Math.sqrt(Math.pow(self.x-pt.x,2) + Math.pow(self.y-pt.y,2));
	}
	return self;
}

const Player = id => {
	const self = Entity();
	self.id = id;
	self.number = `${Math.floor(10 * Math.random())}`;
	self.pressingLeft = false;
	self.pressingRight = false;
	self.pressingUp = false;
	self.pressingDown = false;
	self.pressingAttack = false;
	self.mouseAngle = 0;
	self.maxSpd = 10;

	const super_update = self.update;
	self.update = () => {
		self.updateSpd();
		super_update();

		if(self.pressingAttack) {
			for(var i=0;i<6;i++) {
				self.shootBullet(i * 10 + self.mouseAngle);
			}
		}
	}

	self.shootBullet = angle => {
		const b = Bullet(self.id,angle);
		b.x = self.x;
		b.y = self.y;
	}

	self.updateSpd = () => {
		if(self.pressingRight)
			self.spdX = self.maxSpd;
		else if(self.pressingLeft)
			self.spdX = -self.maxSpd;
		else
			self.spdX = 0;

		if(self.pressingDown)
			self.spdY = self.maxSpd;
		else if(self.pressingUp)
			self.spdY = -self.maxSpd;
		else
			self.spdY = 0;
	}
	Player.list[id] = self;
	return self;
};

Player.list = {};
Player.onConnect = socket => {
	const player = Player(socket.id);
	socket.broadcast.emit('serverMsg', {
		msg: `Player ${player.number} has joined!`,
		number: player.number
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
		else if(data.inputId === 'attack')
			player.pressingAttack = data.state;
		else if(data.inputId === 'mouseAngle')
			player.mouseAngle = data.state;
	});
};

Player.onDisconnect = socket => {
	delete Player.list[socket.id];
};

Player.update = () => {
	const pack = [];
	for(const i in Player.list) {
		const player = Player.list[i];
		player.update();
		pack.push({
			x: player.x,
			y: player.y,
			number: player.number
		});
	}
	return pack;
}

const Bullet = (parent, angle) => {
	const self = Entity();
	self.id = Math.random();
	self.spdX = Math.cos(angle/180*Math.PI) * 10;
	self.spdY = Math.sin(angle/180*Math.PI) * 10;
	self.parent = parent;
	self.timer = 0;
	self.toRemove = false;
	const super_update = self.update;
	self.update = () => {
		if(self.timer++ > 100)
			self.toRemove = true;
		super_update();

		for(const i in Player.list) {
			const p = Player.list[i];
			if(self.getDistance(p)	 < 32 && self.parent !== p.id) {
				// handle collision hp--;
				self.toRemove = true;
			}
		}
	}

	Bullet.list[self.id] = self;
	return self;
}
Bullet.list = {};

Bullet.update = () => {
	const pack = [];
	for(const i in Bullet.list) {
		const bullet = Bullet.list[i];
		bullet.update();
		if(bullet.toRemove)
			delete Bullet.list[i];
		else 
			pack.push({
				x: bullet.x,
				y: bullet.y
			});
	}
	return pack;
}

const DEBUG = true;

const isUsernameTaken = (data, cb) => {
	User.findOne({'username': data.username}, (err, res) => {
		if(err)
			cb(err);
		if(res)
			cb(true);
		else
		cb(false);
	});
}

const addUser = (data, cb) => {
	const user = new User();
	user.username = data.username;
	user.password = user.generateHash(data.password);
	user.save();
	cb();
}

const io = require('socket.io')(serv, {});
io.sockets.on('connection', socket => {
	socket.id = Math.random();
	SOCKET_LIST[socket.id] = socket;

	socket.on('signIn', data => {
		User.findOne({'username': data.username}, (err, res) => {
			if(err)
				return err
			if(!res)
				return socket.emit('signInResponse', {success: false});
			if(!res.validPassword(data.password)) 
				return socket.emit('signInResponse', {success: false});
			else {
				Player.onConnect(socket);
				socket.emit('signInResponse', {success: true});
			}
		});
	});	

	socket.on('signUp', data => {
		isUsernameTaken(data, res => {
			if(res) {
				socket.emit('signUpResponse', {success: false});
			} else {
				addUser(data, () => {
					socket.emit('signUpResponse', {success: true});
				});
			}
		});
	});	

	socket.on('disconnect', () => {
		delete SOCKET_LIST[socket.id];
		Player.onDisconnect(socket);
	});

	socket.on('sendMsgToServer', data => {
		const playerName = ("" + socket.id).slice(2,7);
		for(const i in SOCKET_LIST) {
			SOCKET_LIST[i].emit('addChat', playerName + ': ' + data);
		}
	})

	socket.on('evalServer', data => {
		if(!DEBUG)
			return;

		const res = eval(data);
		socket.emit('evalAnswer', res);
	})
});

setInterval(() => {
	const pack = {
		player: Player.update(),
		bullet: Bullet.update()
	}

	for(const i in SOCKET_LIST) {
		const socket = SOCKET_LIST[i];
		socket.emit('newPositions', pack);
	}
}, 1000/25);
