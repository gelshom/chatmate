import nodemailer from 'nodemailer';
import { config } from '../config.js';

export async function sendEmail(to, subject, text) {
  const { host, user, pass, port, from } = config.smtp;
  if (!host || !user || !pass) throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.');
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transport.sendMail({ from, to, subject, text });
}
