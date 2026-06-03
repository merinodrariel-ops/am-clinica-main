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

// Prosoft 24+ hour convention (post-midnight times exported as 25:xx, 26:xx, etc.)
const overnightXml = `<?xml version="1.0" encoding="UTF-8"?>
<Fichadas>
  <Empleado>
    <NombreCompleto>Carlos Ruiz</NombreCompleto>
    <Movimientos>
      <Movimiento>
        <DiaFecha>10/04/2026</DiaFecha>
        <HoraIngreso>14:00</HoraIngreso>
        <HoraEgreso>25:30</HoraEgreso>
      </Movimiento>
      <Movimiento>
        <DiaFecha>11/04/2026</DiaFecha>
        <HoraIngreso>22:00</HoraIngreso>
        <HoraEgreso>26:00</HoraEgreso>
      </Movimiento>
    </Movimientos>
  </Empleado>
</Fichadas>`;

const overnightParsed = parseProsoftXml(overnightXml);
assert.equal(overnightParsed.filas.length, 1);
assert.equal(overnightParsed.filas[0]?.rawName, 'Carlos Ruiz');
assert.equal(overnightParsed.filas[0]?.registros.length, 2);

const reg1 = overnightParsed.filas[0]?.registros[0];
assert.equal(reg1?.entrada, '14:00');
assert.equal(reg1?.salida, '01:30', 'Prosoft 25:30 should normalize to 01:30');
assert.equal(reg1?.salidaDiaSiguiente, true);
assert.equal(reg1?.horas, 11.5, 'Turno 14:00–25:30 = 11.5h');

const reg2 = overnightParsed.filas[0]?.registros[1];
assert.equal(reg2?.entrada, '22:00');
assert.equal(reg2?.salida, '02:00', 'Prosoft 26:00 should normalize to 02:00');
assert.equal(reg2?.salidaDiaSiguiente, true);
assert.equal(reg2?.horas, 4, 'Turno 22:00–26:00 = 4h');

console.log('prosoft-xml.spec.ts: ok');
