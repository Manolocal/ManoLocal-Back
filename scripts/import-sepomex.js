const fs = require('fs');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BATCH_SIZE = 5000;
const FILE_PATH = 'CPdescarga.txt';

async function importSepomex() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`Error: Archivo no encontrado en ${FILE_PATH}`);
    process.exit(1);
  }

  console.log('--- Iniciando importación de Catálogo Maestro SEPOMEX ---');
  console.log(`Leyendo '${FILE_PATH}' en formato streaming...`);

  const rl = readline.createInterface({
    input: fs.createReadStream(FILE_PATH, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  let lineIndex = 0;
  let batch = [];
  let totalInserted = 0;
  const startTime = Date.now();

  for await (const line of rl) {
    lineIndex++;
    // Las primeras 2 líneas son el aviso legal y la cabecera
    if (lineIndex <= 2 || !line.trim()) {
      continue;
    }

    const cols = line.split('|');
    if (cols.length < 5) {
      continue;
    }

    // Mapeo exacto de las 15 columnas oficiales de SEPOMEX
    const record = {
      postalCode: (cols[0] || '').trim(),
      asentamiento: (cols[1] || '').trim(),
      tipoAsenta: cols[2] ? cols[2].trim() : null,
      municipio: (cols[3] || '').trim(),
      estado: (cols[4] || '').trim(),
      ciudad: cols[5] ? cols[5].trim() : null,
      dCp: cols[6] ? cols[6].trim() : null,
      cEstado: cols[7] ? cols[7].trim() : null,
      cOficina: cols[8] ? cols[8].trim() : null,
      cCp: cols[9] ? cols[9].trim() : null,
      cTipoAsenta: cols[10] ? cols[10].trim() : null,
      cMnpio: cols[11] ? cols[11].trim() : null,
      idAsentaCpcons: cols[12] ? cols[12].trim() : null,
      zona: cols[13] ? cols[13].trim() : null,
      cCveCiudad: cols[14] ? cols[14].trim() : null,
    };

    batch.push(record);

    if (batch.length >= BATCH_SIZE) {
      const chunk = batch;
      batch = [];
      await prisma.sepomexPostalCode.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      totalInserted += chunk.length;
      process.stdout.write(
        `Progreso: ${totalInserted.toLocaleString()} registros insertados en Supabase...\r`,
      );
    }
  }

  // Insertar registros restantes
  if (batch.length > 0) {
    await prisma.sepomexPostalCode.createMany({
      data: batch,
      skipDuplicates: true,
    });
    totalInserted += batch.length;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nImportación completada exitosamente!`);
  console.log(`Total registros insertados: ${totalInserted.toLocaleString()}`);
  console.log(`Tiempo transcurrido: ${durationSec}s`);
}

importSepomex()
  .catch((err) => {
    console.error('Error durante la importación:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
