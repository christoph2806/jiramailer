const server = require('server');
const secrets = require('secrets.js');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { error } = server.router;
const { status } = server.reply;
const winston = require('winston');

const signature =
    "\n" +
    "--\n" +
    "\n" +
    "Mail: service@progeno.de\n" +
    "Web: www.progeno.de\n" +
    "\n" +
    "Progeno Wohnungsgenossenschaft eG\n" +
    "Ruth-Drexel-Str. 154, 81927 München\n" +
    "\n" +
    "Sitz der Genossenschaft: München\n" +
    "Registergericht: Amtsgericht München, GnR 2652\n" +
    "\n" +
    "Vorstand: Philipp Terhorst, Almut Münster\n" +
    "Aufsichtsratsvorsitzender: Christoph Mussenbrock";

const sender = '"Progeno Servicedesk" <service@progeno.de>';


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

const updateComment = function(data, info) {

    axios.put(
        `http://localhost:8100/rest/api/2/issue/${data.issue.id}/comment/${data.comment.id}`,
        {body: data.comment.body +
                "\n----\n" +
                "Versandprotokoll:\n" +
                "Erfolgreich: " + info.accepted.join(', ') + "\n" +
                (info.rejected.length > 0 ? "Nicht erfolgreich: " + info.rejected.join(', ') + "\n" : "")
        },
        {
            auth: secrets.basicauth2,
            headers: {"Content-Type": "application/json"}
        }
    )

};




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

                let data = ctx.data;
                let attachments = [];

                logger.log(
                    'info',
                    'Request received, issue: ' +
                    data.issue.key + ' ' +
                    data.issue.fields.summary);
//                logger.log('info', ctx.data);

                let recipient_match = data.comment.body.match(
                    /[aA]n\:\s*\[*(?<email>[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)/
                );
                let recipient = recipient_match ? recipient_match.groups.email : null;

                if (!recipient) {
                    // nothing to do
                    logger.log('info', 'nothing to do');
                    return('ok');
                }

                logger.log('info', 'Recipient: ' + recipient);
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


                let cc_match = data.comment.body.match(
                    /[cC][cC]\:\s*\[*(?<email>[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)/
                );
                let cc = cc_match ? cc_match.groups.email : null;

                let subject_match = data.comment.body.match(
                    /[bB]etreff\:\s*(?<subject>.+)/
                );
                let subject = subject_match ? data.issue.key + ': ' + subject_match.groups.subject : null;

                let body_match = data.comment.body.match(
                    /[bB]etreff\:\s*.+\s(?<body>[^]*)/
                );

                let body = body_match ? body_match.groups.body + signature: null;

                // send mail with defined transport object
                let message = {
                    from: sender, // sender address
                    replyTo: sender,
                    to: recipient, // list of receivers
                    subject: subject, // Subject line
                    text: body, // plain text body
                    attachments: attachments
                };

                if (cc) {
                    message.cc = cc;
                    logger.log('info', 'CC: ' + cc);
                }

                logger.log('info', 'Subject: ' + subject);

                let info = await transporter.sendMail(message);
                logger.log('info', 'SMTP result: ', info);

                updateComment(data, info);

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
            return('ok');
        })
    ]);
};

main();
