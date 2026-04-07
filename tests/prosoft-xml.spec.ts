import assert from 'node:assert/strict';
import { parseProsoftXml } from '../lib/prosoft-xml';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<exportacion>
  <registros>
    <registro>
      <prestador>Maria Perez</prestador>
      <fecha>2026-04-03</fecha>
      <entrada>08:00</entrada>
      <salida>16:30</salida>
    </registro>
    <registro>
      <prestador>Maria Perez</prestador>
      <fecha>2026-04-04</fecha>
      <entrada>08:15</entrada>
      <salida>16:15</salida>
    </registro>
    <registro>
      <prestador>Ana Gomez</prestador>
      <fecha>2026-04-03</fecha>
      <entrada>09:00</entrada>
      <salida>13:00</salida>
    </registro>
  </registros>
</exportacion>`;

const parsed = parseProsoftXml(xml);

assert.equal(parsed.mes, '2026-04');
assert.equal(parsed.totalRegistros, 3);
assert.equal(parsed.filas.length, 2);

const maria = parsed.filas.find((fila: (typeof parsed.filas)[number]) => fila.rawName === 'Maria Perez');
assert.ok(maria);
assert.equal(maria?.registros.length, 2);
assert.equal(maria?.registros[0]?.fecha, '2026-04-03');
assert.equal(maria?.registros[0]?.entrada, '08:00');
assert.equal(maria?.registros[0]?.salida, '16:30');
assert.equal(maria?.registros[0]?.horas, 8.5);

const nestedXml = `<?xml version="1.0" encoding="UTF-8"?>
<Fichadas>
  <Empleado>
    <NombreCompleto>Laura Diaz</NombreCompleto>
    <Movimientos>
      <Movimiento>
        <DiaFecha>05/04/2026</DiaFecha>
        <HoraIngreso>22:00</HoraIngreso>
        <HoraEgreso>06:00</HoraEgreso>
      </Movimiento>
      <Movimiento>
        <DiaFecha>06/04/2026</DiaFecha>
        <HoraIngreso>09:00</HoraIngreso>
        <HorasTrabajadas>4</HorasTrabajadas>
      </Movimiento>
    </Movimientos>
  </Empleado>
</Fichadas>`;

const nestedParsed = parseProsoftXml(nestedXml);
assert.equal(nestedParsed.totalRegistros, 2);
assert.equal(nestedParsed.filas.length, 1);
assert.equal(nestedParsed.filas[0]?.rawName, 'Laura Diaz');
assert.equal(nestedParsed.filas[0]?.registros[0]?.horas, 8);
assert.equal(nestedParsed.filas[0]?.registros[0]?.salidaDiaSiguiente, true);
assert.equal(nestedParsed.filas[0]?.registros[1]?.requiereRevision, true);
assert.equal(nestedParsed.filas[0]?.registros[1]?.motivoObservado, 'FaltaEgreso');

console.log('prosoft-xml.spec.ts: ok');
