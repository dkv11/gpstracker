const net = require('net');
const PORT = 21100;

let clients = {};

const server = net.createServer(socket => {
    let clientKey = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`Device connected: ${clientKey}`);

    clients[clientKey] = {
        socket: socket,
        lastHeartbeat: new Date(),
        retries: 0, // Tracking retries for reconnections
        isConnected: false
    };

    socket.on('data', (data) => {
        console.log('Data received');
        parsePacket(data, socket, clientKey);
    });

    socket.on('close', () => {
        console.log(`Connection closed: ${clientKey}`);
        clearInterval(clients[clientKey].heartbeatTimer);
        delete clients[clientKey];
    });

    socket.on('error', (err) => {
        console.error(`Error with connection ${clientKey}:`, err);
    });
});

function parsePacket(dataBuffer, socket, clientKey) {
    const startBit = dataBuffer.slice(0, 2).toString('hex');
    const packetLength = dataBuffer.readUInt8(2);
    const protocolNo = dataBuffer.readUInt8(3);
    const infoContent = dataBuffer.slice(4, 4 + packetLength - 5);
    const serialNumber = dataBuffer.readUInt16BE(4 + packetLength - 5);
    const errorCheck = dataBuffer.readUInt16BE(4 + packetLength - 3);
    const stopBit = dataBuffer.slice(-2).toString('hex');

    console.log(`Parsed Packet - Start: ${startBit}, Length: ${packetLength}, Protocol: ${protocolNo},infoContant: ${infoContent}, Serial: ${serialNumber}, Check: ${errorCheck}, Stop: ${stopBit}`);


    switch (protocolNo) {
        case 0x01:
            handleLogin(socket, clientKey, dataBuffer);
            break;
        case 0x10:
            handleHeartbeat(socket, clientKey);
            break;
        case 0x22:
            handleLocation(dataBuffer);
            break;
        case 0x13:
            handleStatusUpdate(dataBuffer);
            break;
        // case 0x26:
        //     handleAlarm(dataBuffer);
        //     break;
        default:
            console.log(`Received unknown packet type: ${protocolNo}`);
            break;
    }
}

function handleLogin(socket, clientKey, dataBuffer) {
    const startBit = dataBuffer.slice(0, 2).toString('hex');
    const packetLength = dataBuffer.readUInt8(2);
    const protocolNo = dataBuffer.readUInt8(3);
    const imei = dataBuffer.slice(4, 4 + 8).toString('hex'); // Assuming IMEI is 15 bytes long starting at byte 4
    const serialNumber = dataBuffer.readUInt16BE(12);
    const errorCheck = dataBuffer.readUInt16BE(14);
    const stopBit = dataBuffer.slice(16, 18).toString('hex');

    console.log(`Login packet - protocolNo : ${protocolNo},IMEI: ${imei}, Serial: ${serialNumber}, Check: ${errorCheck}`);

    if (startBit === '7878' && stopBit === '0d0a') {
        clients[clientKey].imei = imei;
        clients[clientKey].lastHeartbeat = new Date();
        clients[clientKey].isConnected = true;
        clients[clientKey].retries = 0;

        // Construct the response packet
        const response = Buffer.alloc(10); // Adjust size according to what's needed
        response.write('7878', 0, 'hex'); // Start bit
        response.writeUInt8(5, 2); // Length of the packet
        response.writeUInt8(0x01, 3); // Protocol number for a login response
        response.writeUInt16BE(serialNumber, 4); // Echo back the serial number
        response.write('0d0a', 6, 'hex'); // Stop bit

        socket.write(response);

        console.log(`Login acknowledged for ${imei}`);
    } else {
        console.log('Packet error: invalid start/stop bits');
        socket.end(); // Optionally end the connection if packet is invalid
    }
}



function handleHeartbeat(socket, clientKey) {
    console.log(`Heartbeat received from ${clientKey}`);
    clients[clientKey].lastHeartbeat = new Date();
    clients[clientKey].retries = 0;
    socket.write('Heartbeat acknowledged');
}

function handleLocation(dataBuffer) {
    const startBit = dataBuffer.slice(0, 2).toString('hex');
    const packetLength = dataBuffer.readUInt8(2);
    const protocolNo = dataBuffer.readUInt8(3);
    // const latitude = dataBuffer.readFloatBE(4);
    // const longitude = dataBuffer.readFloatBE(8);
    const dataTime = dataBuffer.slice(4,10).toString('hex');
    const gpsSatellites = dataBuffer.readUInt8(10);

    const latitude = dataBuffer.slice(11, 15).toString('hex');
    const longitude = dataBuffer.slice(15, 19).toString('hex');
    const speed = dataBuffer.readUInt8(19);

    let indexAfterCoords = 37;

    let mileage;
    if (packetLength > 30) { // Example condition to check if mileage is included
        mileage = dataBuffer.readUInt32BE(indexAfterCoords);
        indexAfterCoords += 4;
    }

    const serialNumber = dataBuffer.readUInt16BE(indexAfterCoords-4);
    const errorCheck = dataBuffer.readUInt16BE(indexAfterCoords + 2);
    const stopBit = dataBuffer.slice(indexAfterCoords + 4, indexAfterCoords + 6).toString('hex');

    console.log(`Position data - Latitude: ${latitude}, Longitude: ${longitude}, Mileage: ${mileage || 'Not provided'}, Serial: ${serialNumber}, Check: ${errorCheck}`);

    if (startBit === '7878' && stopBit === '0d0a' && verifyChecksum(dataBuffer, errorCheck)) {
        console.log('Position data packet verified and processed');
        // Here, you could log the data, store it in a database, or perform other processing
        // Optionally, send a response if required by the protocol
    } else {
        console.log('Packet error: invalid data or checksum');
        // Handle error or log incident
    }
}

function verifyChecksum(dataBuffer, expectedChecksum) {
    // Implement checksum verification logic here
    // This is a placeholder for illustrative purposes
    return true;
}


function handleStatusUpdate(infoContent) {
    console.log('Status update received');
    // Additional logic for processing status updates goes here
}

function handleAlarm(dataBuffer) {
    // Basic parsing according to the PT06 protocol
    const startBit = dataBuffer.slice(0, 2).toString('hex');
    const packetLength = dataBuffer.readUInt8(2);
    const protocolNo = dataBuffer.readUInt8(3);
    const dateTime = dataBuffer.slice(4, 10).toString('hex');  // Example: Extract date and time
    const alarmType = dataBuffer.readUInt8(10);
    const latitude = dataBuffer.readFloatBE(11);
    const longitude = dataBuffer.readFloatBE(15);
    const speed = dataBuffer.readUInt8(19); // Assuming speed is at this position
    const courseStatus = dataBuffer.readUInt16BE(20); // Course and status information
    const serialNumber = dataBuffer.readUInt16BE(packetLength + 4 - 6);
    const errorCheck = dataBuffer.readUInt16BE(packetLength + 4 - 4);
    const stopBit = dataBuffer.slice(packetLength + 4 - 2).toString('hex');

    console.log(`Alarm packet - Date/Time: ${dateTime}, Type: ${alarmType}, Lat: ${latitude}, Long: ${longitude}, Speed: ${speed}, Course/Status: ${courseStatus}`);

    // Verify packet integrity
    if (startBit === '7878' && stopBit === '0d0a') {
        switch (alarmType) {
            case 1:
                console.log("SOS alarm triggered");
                break;
            case 2:
                console.log("Power cut alarm triggered");
                break;
            
            default:
                console.log("Unknown alarm type");
                break;
        }
        
    } else {
        console.log('Error: Packet corruption detected');
    }
}


server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
