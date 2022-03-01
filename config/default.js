module.exports = {
    ari: {
        url: 'https://foo.com',
        username: 'username',
        password: 'password',
        appName: 'dana-bridge'
    },
    rtpServer: {
        host: '127.0.0.1',
        port: '7777',
        format: 'slin',
        direction: 'both-separate', // allowed values: in, out, both, both-separate
    },
    mqtt: {
        url: "ws://broker.hivemq.com:8000/mqtt",
        topicPrefix: 'danatsg-ct'
    }
}