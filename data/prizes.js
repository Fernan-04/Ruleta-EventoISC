// Orden fijo del sorteo: primero 10 completas, luego 15 medias.
// Script normal (no módulo) para que funcione abriendo index.html sin servidor.
window.PRIZES = [
  ...Array(4).fill({ b:'Asesoría de CV & LinkedIn (30 min)',          a:'Inspírate Creator', k:'full' }),
  ...Array(2).fill({ b:'Curso de IA con Claude',                      a:'Data Science',      k:'full' }),
  ...Array(2).fill({ b:'Curso de Python + IA',                        a:'Data Science',      k:'full' }),
  ...Array(2).fill({ b:'El Journey Analítico con IA y Power BI',      a:'Data Science',      k:'full' }),
  ...Array(3).fill({ b:'Asesoría de CV (30 min)',                     a:'Inspírate Creator', k:'half' }),
  ...Array(3).fill({ b:'Asesoría de LinkedIn (30 min)',               a:'Inspírate Creator', k:'half' }),
  ...Array(3).fill({ b:'Especialización en Data Engineer (60%)',      a:'Data Science',      k:'half' }),
  ...Array(3).fill({ b:'Especialización en Analista de Datos (60%)',  a:'Data Science',      k:'half' }),
  ...Array(3).fill({ b:'Bootcamp de Data Architecture (60%)',         a:'Data Science',      k:'half' }),
];

// Lista de ejemplo: se reemplaza pegando la columna "Nombre completo" del Google Sheet.
window.SAMPLE_NAMES = [
  'Ana Lucía Pérez Rojas','Diego Segovia Natividad','Camila Torres Huamán','Luis Alberto Vega Mendoza',
  'María Fernanda Quispe','Jorge Ramírez Salas','Valeria Chávez Ríos','Renzo Paredes Lima',
  'Lucía Mendoza Arce','Carlos Ruiz Tapia','Fiorella Cusi Uquiche','Mateo Andrade Ballen',
  'Sofía Gutiérrez León','Andrés Castillo Arteaga','Daniela Flores Vera','Piero Yauri Esteban',
  'Ximena Salazar Cribillero','Gabriel Huatay Salcedo','Nicole Núñez Velarde','Sebastián Lajo Timoteo',
  'Paula Rengifo Soto','Kevin Delgado Caballón','Andrea Girao Pebes','Bruno Atoche Sánchez',
  'Mariana Contreras Casimiro','Joaquín Ríos López','Alessandra Vargas Cruz','Thiago Morales Pinto'
];
