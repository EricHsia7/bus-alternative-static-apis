const fs = require('fs');
const path = require('path');
const { makeDirectory } = require('./files.js');
const pako = require('pako');

async function fetchData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // const contentLength = parseInt(String(response.headers.get('content-length')));
  let receivedLength = 0;
  const reader = response.body.getReader();
  const chunks = [];
  while (true) {
    var { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    receivedLength += value.length;
  }

  // Concatenate all the chunks into a single Uint8Array
  const uint8Array = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    uint8Array.set(chunk, position);
    position += chunk.length;
  }

  // Create a blob from the concatenated Uint8Array
  const blob = new Blob([uint8Array]);
  const gzip_blob = new Blob([blob.slice(0, blob.size)], { type: 'application/gzip' });
  const buffer = await gzip_blob.arrayBuffer();
  const inflatedData = pako.inflate(buffer, { to: 'string' }); // Inflate and convert to string using pako
  return inflatedData;
}

function getAPI(city, api) {
  const cities = ['blobbus', 'ntpcbus'];
  // blobbus → Taipei City
  // ntpcbus → New Taipei City
  const buckets = ['BusData', 'BusEvent', 'CarInfo', 'CarUnusual', 'EstimateTime', 'IStop', 'IStopPath', 'OrgPathAttribute', 'PathDetail', 'Provider', 'Route', 'Stop', 'SemiTimeTable', 'StopLocation', 'TimeTable', 'BusRouteFareList'];
  return [cities[city], buckets[api], `https://tcgbusfs.blob.core.windows.net/${cities[city]}/Get${buckets[api]}.gz?_=${new Date().getTime()}`];
}

async function main() {
  const cityIndexes = [0, 1];
  const staticAPIIndexes = [2, 3, 9, 10, 11];

  for (const cityIndex of cityIndexes) {
    for (const staticAPIIndex of staticAPIIndexes) {
      const api = getAPI(cityIndex, staticAPIIndex);
      const data = await fetchData(api[2]);
      if (/^<!doctype html>/.test(data)) {
        console.log(`${api[0]}/${api[1]}: failed`);
      } else {
        const dirPath = `./dist/${api[0]}`;
        await makeDirectory(dirPath);
        const parsedData = JSON.parse(data);
        const filePath = `${dirPath}/${api[1]}.gz`;
        const compressedData = pako.gzip(JSON.stringify(parsedData));
        await fs.promises.writeFile(filePath, Buffer.from(compressedData));
        console.log(`${api[0]}/${api[1]}: successful`);
      }
    }
  }
  process.exit(0);
}

main();
