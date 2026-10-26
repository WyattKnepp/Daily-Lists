const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, makeTempRoot } = require('./helpers/server');

describe('data: persistence', () => {
  test('lists, counters and recurring items survive a server restart', async () => {
    const dirs = makeTempRoot();
    const first = await startServer({ dirs });
    try {
      await first.api('PUT', '/list/10-26-26', { content: '- [x] done\n- [ ] todo' });
      await first.api('PUT', '/meta/10-26-26', { MM: 3, PA: 1 });
      await first.api('PUT', '/recurring', [{ id: 1, label: 'Stretch', days: [0, 6] }]);
    } finally {
      await first.stop();
    }

    const second = await startServer({ dirs });
    try {
      assert.deepEqual(await (await second.api('GET', '/lists')).json(), ['10-26-26']);
      assert.equal(await (await second.api('GET', '/list/10-26-26')).text(), '- [x] done\n- [ ] todo');
      assert.deepEqual(await (await second.api('GET', '/meta/10-26-26')).json(), { MM: 3, PA: 1 });
      assert.deepEqual(await (await second.api('GET', '/recurring')).json(), [{ id: 1, label: 'Stretch', days: [0, 6] }]);
    } finally {
      await second.stop();
    }
  });
});
