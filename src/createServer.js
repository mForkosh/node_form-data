'use strict';

const http = require('http');
const fs = require('fs/promises');
const path = require('path');

class CustomServer extends http.Server {
  #endpoints = {};

  get(endpoint, cb) {
    if (!this.#endpoints.hasOwnProperty(endpoint)) {
      this.#endpoints[endpoint] = {};
    }

    this.#endpoints[endpoint].get = cb;
  }

  post(endpoint, cb) {
    if (!this.#endpoints.hasOwnProperty(endpoint)) {
      this.#endpoints[endpoint] = {};
    }

    this.#endpoints[endpoint].post = cb;
  }

  useCb(req, res) {
    const normalizeMethod = req.method.toLowerCase();
    const normalizeUrl = new URL(req.url, `http://${req.headers.host}`);
    const urlPath = normalizeUrl.pathname || '/';

    if (!this.#endpoints.hasOwnProperty(urlPath)) {
      throw new Error(404);
    } else if (!this.#endpoints[urlPath].hasOwnProperty(normalizeMethod)) {
      throw new Error(405);
    }

    const cb = this.#endpoints[urlPath][normalizeMethod];

    return cb(req, res);
  }

  initServer() {
    this.on('request', async (req, res) => {
      try {
        this.useCb(req, res);
      } catch (err) {
        const status = Number(err.message) || 520;

        res.statusCode = status;

        switch (status) {
          case 404:
            res.end('The requested resource could not be found on this server');
            break;
          case 405:
            res.end(
              'The requested HTTP method is not supported for this endpoint',
            );
            break;

          default:
            res.statusCode = 520;
            res.end('The server returned an unknown error.');
        }
      }
    });
  }
}

function createServer() {
  const server = new CustomServer();

  server.initServer();

  server.get('/', (_r, res) => {
    const form = `<form method='POST' action="http://localhost:5701/add-expense">
        <input name="date" required type="date" />
        <input name="title" required type="text" />
        <input name="amount" required type="text" />
        <input type="submit" />
      </form>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(form);
  });

  server.post('/add-expense', async (req, res) => {
    const pathToDb = path.resolve(__dirname, '..', 'db', 'expense.json');
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const data = Buffer.concat(chunks).toString();
    let dataObject;

    switch (req.headers['content-type']) {
      case 'application/json':
        dataObject = JSON.parse(data);
        break;
      case 'application/x-www-form-urlencoded':
        const entriesForObj = new URLSearchParams(data);

        dataObject = Object.fromEntries(entriesForObj);
        break;
      default:
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Сontent type not supported');

        return;
    }

    const { date, title, amount } = dataObject;

    if (!date || !title || !amount) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid data');

      return;
    }

    try {
      await fs.access(pathToDb, fs.constants.F_OK);
    } catch (_e) {
      try {
        await fs.mkdir(path.join(pathToDb, '..'), { recursive: true });
      } catch (_err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Something went wrong');

        return;
      }
    }

    let expensesList;

    try {
      expensesList = JSON.parse(await fs.readFile(pathToDb));

      if (!Array.isArray(expensesList)) {
        expensesList = JSON.stringify([dataObject]);
      } else {
        const copyList = [...expensesList, dataObject];

        expensesList = JSON.stringify(copyList);
      }

      await fs.writeFile(pathToDb, expensesList);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Something went wrong');

      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(`<pre>${expensesList}</pre>`);
  });

  return server;
}

module.exports = {
  createServer,
};
