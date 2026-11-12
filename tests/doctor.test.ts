import { expect, test } from 'claude-code/testing'

import { formatDoctor, paneState, probeLine } from '../hooks/doctor'

test('formatDoctor: one line per check, a failed check is a line', () => {
  expect(formatDoctor([['Surfaces', 'terminal, desktop'], ['Agents', new Error('x'.repeat(200))]])).toBe(
    ['Horus doctor (this session):', 'Surfaces: terminal, desktop', `Agents: check failed (${'x'.repeat(119)}…)`].join('\n'),
  )
})

test('paneState: not open, placed, or waiting undrawn', () => {
  const panes = [{ id: 'horus', isPlaced: true }, { id: 'horus-temple', isPlaced: false }]
  expect(paneState(panes, 'horus')).toBe('open, placed')
  expect(paneState(panes, 'horus-temple')).toBe('open, waiting undrawn')
  expect(paneState([], 'horus')).toBe('not open')
})

test('probeLine: deny, error, answer and rejection, trimmed to 120', () => {
  const tail = ' ("not found" means the call itself works)'
  expect(probeLine({ deny: 'no' })).toBe(`denied: no${tail}`)
  expect(probeLine({ isError: true, text: 'No task found with ID: horus-doctor-probe' })).toBe(`error: No task found with ID: horus-doctor-probe${tail}`)
  expect(probeLine({ result: { message: 'stopped' } })).toBe(`answered: stopped${tail}`)
  expect(probeLine(new Error('y'.repeat(300)))).toBe(`rejected: ${'y'.repeat(109)}…${tail}`)
})
