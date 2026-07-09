const fs = require('fs');
const path = require('path');
const { makeDirectory } = require('./files.js');
const { Decompress, gzipSync } = require('fflate');

function concatChunks(chunks) {
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(size);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

async function fetchInflate(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error('No response body to stream');

  const total = parseInt(String(response.headers.get('content-length')), 10);
  let loaded = 0;

  const inflater = new Decompress();
  const chunks = [];

  inflater.ondata = (chunk, final) => {
    // slice() -> own the exact bytes so transferring the buffer is safe.
    // (fflate may hand back a view into a larger internal buffer.)
    const output = chunk.slice();
    chunks.push(output);
  };

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    loaded += value.length;
    inflater.push(value, false); // feed compressed bytes incrementally
  }

  inflater.push(new Uint8Array(0), true); // final = true -> flush the tail

  const buffer = concatChunks(chunks);
  const decoder = new TextDecoder();
  const inflatedData = decoder.decode(buffer);
  return inflatedData;
}

async function fetchJSON(url, outputDir, name) {
  const data = await fetchInflate(url);
  if (/^<!doctype html>/.test(data)) {
    console.log(`Failed to fetch ${url}`);
  } else {
    await makeDirectory(outputDir);
    const parsedData = JSON.parse(data);
    const filePath = path.join(outputDir, `Get${name}.gz`);
    const json = JSON.stringify(parsedData);
    const encoder = new TextEncoder();
    const buffer = encoder.encode(json);
    const compressed = gzipSync(buffer);
    await fs.promises.writeFile(filePath, Buffer.from(compressed));
    console.log(`Successfully fetched ${url}`);
  }
}

async function fetchXML(url, outputDir, name) {
  const data = await fetchInflate(url);
  if (/^<!doctype html>/.test(data)) {
    console.log(`Failed to fetch ${url}`);
  } else {
    await makeDirectory(outputDir);
    const filePath = path.join(outputDir, `Get${name}.gz`);
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    const compressed = gzipSync(buffer);
    await fs.promises.writeFile(filePath, Buffer.from(compressed));
    console.log(`Successfully fetched ${url}`);
  }
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
  // static
  const staticJsonAPIIndices = [2, 3, 9, 10, 11, 12, 14];
  const staticXmlAPIIndices = [15];

  // dynamic
  const dynamicJsonAPIIndices = [0, 1, 4, 5, 6, 7, 8];

  const list = [];

  for (const cityIndex of cityIndexes) {
    for (const index of staticJsonAPIIndices) {
      const api = getAPI(cityIndex, index);
      list.push(fetchJSON(api[2], `./dist/${api[0]}`, api[1]));
    }
  }

  for (const cityIndex of cityIndexes) {
    for (const index of staticXmlAPIIndices) {
      const api = getAPI(cityIndex, index);
      list.push(fetchXML(api[2], `./dist/${api[0]}`, api[1]));
    }
  }

  for (const cityIndex of cityIndexes) {
    for (const index of dynamicJsonAPIIndices) {
      const api = getAPI(cityIndex, index);
      list.push(fetchJSON(api[2], `./dist/${api[0]}`, api[1]));
    }
  }

  await Promise.allSettled(list);
  process.exit(0);
}

main();
