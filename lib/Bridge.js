const config = require('config');
const { EventEmitter } = require('events');

class Bridge extends EventEmitter {
    constructor(ariClient, exten, log) {
        super();
        this.logger = log.child({ bridgeName: exten });
        this.ariClient = ariClient;
    }

    async create () {
        this.bridge = await this.ariClient.Bridge();
        await this.bridge.create({type: 'audio_sfu,mixing'});

        this.bridge.on('ChannelLeftBridge', (event) => {
            this.logger.info(event, 'Channel left bridge');
            if (event.bridge.channels.length === 0) {
                this.emit('empty');
            }
        })

        return this.bridge;
    }

    async destroy() {
        let destroyed = await this.bridge.destroy();
        return destroyed;
    }

    async addChannel(channel) {

        await this.bridge.addChannel({channel: channel.id});

        //check if we actually want to snoop
        if (config.get('rtpServer.host')) {
            switch (config.get('rtpServer.direction')) {
                case 'out':
                    await this.snoopChannel(channel, 'out');
                    break;
                case 'both':
                    await this.snoopChannel(channel, 'both');
                    break;
                case 'both-separate':
                    await this.snoopChannel(channel, 'in');
                    await this.snoopChannel(channel, 'out');
                    break;
                case 'in':
                default:
                    await this.snoopChannel(channel, 'in');
                    break;
            }
        }
    }

    async snoopChannel(channel, direction) {
        //create the bridge that'll link the snooping channel & externalMedia channels
        let snoopBridge = await this.ariClient.Bridge();
        let externalMediaChannel = this.ariClient.Channel();
        let externalMediaUdpSourcePort = null;
        let callerName = channel.caller.name || 'Unknown';

        let bridgeRes = await snoopBridge.create({type: 'mixing', name: `${channel.id}-${direction}-snooping-bridge`});
        this.logger.info(`created a bridge for the snoop & externalMedia (direction: ${direction})`);

        let snoopOptions = {
            app: config.get('ari.appName'),
            appArgs: 'snooping',
            channelId: channel.id,
            snoopId: `${channel.id}_${direction}_snoop`,
            spy: direction
        };

        //create the external Media channel
        let snoopChannelRes = await this.ariClient.channels.snoopChannelWithId(snoopOptions);
        this.logger.info(`created a snooping channel (direction: ${direction})`);

        snoopBridge.addChannel({channel: snoopChannelRes.id});
        snoopChannelRes.on('StasisEnd', () => {
            this.logger.info(`snoop channel ended (direction: ${direction})`);
            externalMediaChannel.hangup();
        })

        externalMediaChannel.on('StasisStart', (event, channel) => {
            this.logger.info(event, `got a stasisStart event on the externalMediaChannel (direction: ${direction})`);
            snoopBridge.addChannel({channel: channel.id});
        });

        externalMediaChannel.on('StasisEnd', () => {
            this.logger.info(`external media channel ended (direction: ${direction})`);
            snoopBridge.destroy();
            this.emit('streamEnded', {
                roomName: `${channel.dialplan.exten}-${direction}`,
                port: externalMediaUdpSourcePort,
                callerName: callerName,
                channelId: channel.id
            });
        });

        let externalMediaOptions = {
            app: config.get('ari.appName'),
            external_host: `${config.get('rtpServer.host')}:${config.get('rtpServer.port')}`,
            format: config.get('rtpServer.format')
        };

        let externalMediaRes = await externalMediaChannel.externalMedia(externalMediaOptions);

        //set the externalMediaSourcePort
        externalMediaUdpSourcePort = externalMediaRes.channelvars.UNICASTRTP_LOCAL_PORT;

        this.emit('newStream', {
            roomName: `${channel.dialplan.exten}-${direction}`,
            port: externalMediaUdpSourcePort,
            callerName: callerName,
            channelId: channel.id
        });

        this.logger.info(`created an externalMedia channel (direction: ${direction})`);
    }
}

module.exports = Bridge;  // i miss exports default