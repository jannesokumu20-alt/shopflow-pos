export function isValidKenyanPhone(phone: string): boolean {
  return /^07\d{8}$/.test(phone);
}

export function phoneToEmail(phone: string): string {
  return `${phone}@shoppos.app`;
}

export function maskPhone(phone: string): string {
  if (!phone) return "";
  if (phone.length < 4) return phone;
  return phone.slice(0, 4) + " XXX " + phone.slice(-3);
}