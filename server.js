const server = require('server');
const secrets = require('secrets');
const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs-jetpack');
const { error } = server.router;
const { status } = server.reply;
const winston = require('winston');
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.simple()
    ),
    transports: [
        //
        // - Write to all logs with level `info` and below to `combined.log`
        // - Write all logs error (and below) to `error.log`.
        //
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.gmail.com',
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: secrets.auth
});

const main = () => {
    const {get, post} = server.router;
    server({
        port: 3600,
        security: {
            csrf: {ignoreMethods: ['POST']},
        }
    }, [
        post('/', async ctx => {
            try {
                logger.log(
                    'info',
                    'Request received, issue: ' +
                    ctx.data.issue.key + ' ' +
                    ctx.data.issue.fields.summary);
                let data = ctx.data;
                let attachments = [];
                data.issue.fields.attachment.forEach(item => {
                    if (data.comment.body.search(item.filename) > -1) {
                        attachments.push({
                            filename: item.filename,
                            contentType: item.mimeType,
                            href: item.content,
                            httpHeaders: {Authorization: 'Basic ' + Buffer.from(secrets.basicauth).toString('base64')}
                        });
                    }
                });

                let recipient_match = data.comment.body.match(
                    /[aA]n\:\s*\[*(?<email>[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)/
                );
                let recipient = recipient_match ? recipient_match.groups.email : null;

                let subject_match = data.comment.body.match(
                    /[bB]etreff\:\s*(?<subject>.+)/
                );
                let subject = subject_match ? data.issue.key + ': ' + subject_match.groups.subject : null;

                let body_match = data.comment.body.match(
                    /[bB]etreff\:\s*.+\s(?<body>[^]*)/
                );

                let body = body_match ? body_match.groups.body : null;

                logger.log('info', 'Recipient: ' + recipient);
                logger.log('info', 'Subject: ' + subject);

                // send mail with defined transport object
                let info = await transporter.sendMail({
                    from: '"Progeno Servicedesk" <service@progeno.de>', // sender address
                    to: recipient, // list of receivers
                    subject: subject, // Subject line
                    text: body, // plain text body
                    attachments: attachments
                });
                logger.log('info', 'SMTP result: ', info);
                return ('ok');
            } catch (e) {
                status(500).send(e.message);
                logger.log('error', e.message);
                return ('nok');
            }
        }),
        error(ctx => {
            status(500).send(ctx.error.message);
            logger.log('error', ctx.error.message);
        })
    ]);
};

main();
