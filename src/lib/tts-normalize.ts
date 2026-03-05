// Normaliza números, datas, valores e horários para texto em PT-BR antes do TTS

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEENS = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function numberToWords(n: number): string {
  if (n === 0) return 'zero';
  if (n < 0) return 'menos ' + numberToWords(-n);

  const parts: string[] = [];

  if (n >= 1_000_000) {
    const milhoes = Math.floor(n / 1_000_000);
    parts.push(milhoes === 1 ? 'um milhão' : numberToWords(milhoes) + ' milhões');
    n %= 1_000_000;
    if (n > 0) parts.push(n < 100 ? 'e' : '');
  }

  if (n >= 1000) {
    const mil = Math.floor(n / 1000);
    parts.push(mil === 1 ? 'mil' : numberToWords(mil) + ' mil');
    n %= 1000;
    if (n > 0) parts.push(n < 100 ? 'e' : 'e');
  }

  if (n >= 100) {
    if (n === 100) {
      parts.push('cem');
      n = 0;
    } else {
      parts.push(CENTENAS[Math.floor(n / 100)]);
      n %= 100;
      if (n > 0) parts.push('e');
    }
  }

  if (n >= 10 && n <= 19) {
    parts.push(TEENS[n - 10]);
    n = 0;
  } else if (n >= 20) {
    parts.push(DEZENAS[Math.floor(n / 10)]);
    n %= 10;
    if (n > 0) parts.push('e');
  }

  if (n >= 1 && n <= 9) {
    parts.push(UNIDADES[n]);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// R$ 1.250,90 → "mil duzentos e cinquenta reais e noventa centavos"
function normalizeCurrency(text: string): string {
  return text.replace(/R\$\s*([\d.]+),?(\d{0,2})/g, (_, intPart, cents) => {
    const reais = parseInt(intPart.replace(/\./g, ''), 10);
    const centavos = cents ? parseInt(cents, 10) : 0;
    let result = '';
    if (reais > 0) {
      result += numberToWords(reais) + (reais === 1 ? ' real' : ' reais');
    }
    if (centavos > 0) {
      if (reais > 0) result += ' e ';
      result += numberToWords(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
    }
    if (reais === 0 && centavos === 0) result = 'zero reais';
    return result;
  });
}

// 14:30 → "quatorze e trinta"
function normalizeTime(text: string): string {
  return text.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => {
    const hours = parseInt(h, 10);
    const mins = parseInt(m, 10);
    if (hours > 23 || mins > 59) return _;
    if (mins === 0) return numberToWords(hours) + ' horas';
    return numberToWords(hours) + ' e ' + numberToWords(mins);
  });
}

const MESES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// 01/02/2025 → "primeiro de fevereiro de dois mil e vinte e cinco"
function normalizeDate(text: string): string {
  return text.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_, d, m, y) => {
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    const year = parseInt(y, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return _;
    const dayWord = day === 1 ? 'primeiro' : numberToWords(day);
    return `${dayWord} de ${MESES[month]} de ${numberToWords(year)}`;
  });
}

// 15% → "quinze por cento"
function normalizePercentage(text: string): string {
  return text.replace(/([\d.,]+)%/g, (_, num) => {
    const n = parseFloat(num.replace(/\./g, '').replace(',', '.'));
    if (isNaN(n)) return _;
    return numberToWords(Math.round(n)) + ' por cento';
  });
}

// (11) 99999-1234 → dígitos separados
function normalizePhone(text: string): string {
  return text.replace(/\((\d{2})\)\s*(\d{4,5})-(\d{4})/g, (_, ddd, prefix, suffix) => {
    const digits = (ddd + prefix + suffix).split('').map(d => UNIDADES[parseInt(d)] || 'zero');
    return digits.join(' ');
  });
}

// Números soltos como 1234 → "mil duzentos e trinta e quatro"
// Evita converter números que já foram processados (dentro de palavras, datas, etc.)
function normalizeStandaloneNumbers(text: string): string {
  return text.replace(/(?<![\/\d:.,])(\d{1,9})(?![\/\d:.,])/g, (_, num) => {
    const n = parseInt(num, 10);
    if (isNaN(n)) return _;
    return numberToWords(n);
  });
}

/**
 * Normaliza números, datas, valores e horários em texto PT-BR para TTS.
 * Ordem importa: processar padrões mais específicos antes dos genéricos.
 */
export function normalizeNumbersForTTS(text: string): string {
  let result = text;
  result = normalizeCurrency(result);
  result = normalizeDate(result);
  result = normalizeTime(result);
  result = normalizePercentage(result);
  result = normalizePhone(result);
  result = normalizeStandaloneNumbers(result);
  return result;
}
