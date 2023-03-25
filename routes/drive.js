var express = require('express');
var router = express.Router();

const multer = require('multer')
const upload = multer();

/* GET drive listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

/* Google API */
const stream = require('stream');
const { google } = require('googleapis');

const KEYFILEPATH = `${process.cwd()}/public/credential/credentials.json`;
const SCOPES = ['https://www.googleapis.com/auth/drive'];

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES
})

const drive = google.drive({ version: 'v3', auth });

/* GET Methods */
router.get('/list', async (req, res) => {
  const { data } = await drive.files.list();
  
  res.status(200).send(data.files);
})

router.get('/delete', async (req, res) => {
  const { data } = await drive.files.list({
    q: 'not name = "WAAT"'
  });

  for (let i = 0; i < data.files.length; i++) {
    drive.files.delete({
      fileId: data.files[i].id
    });
  }

  res.status(200).send('finished');
})

/* POST Methods */
router.post('/login', async (req, res) => {
  const { id, pwd } = req.body;
  const { data } = await drive.files.list({
    q: `mimeType = "application/vnd.google-apps.folder" and name contains "${id}${pwd}"`
  });

  if (data.files.length === 0) {
    // 아이디가 존재하지 않을 경우
    const folder = await drive.files.create({
      requestBody: {
        name: `${id}${pwd}`,
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['1RxlfwyPfBh_0CATGpr8IjXcH5tucjHEt']
      },
      fields: 'name,id'
    });

    console.log(`created folder id: ${folder.data.id}`);
    res.status(200).send(folder.data.id);
  }
  else if (data.files.length !== 0) {
    // 아이디가 존재할 경우
    console.log(`already exist id: ${data.files[0].id}`);
    res.status(200).send(data.files[0].id);
  }
})

router.post('/workspaces', async (req, res) => {
  const { workbench } = req.body;
  const { data } = await drive.files.list({
    q: `mimeType = "application/vnd.google-apps.folder" and "${workbench}" in parents`
  });

  res.status(200).send(data.files);
})

router.post('/addWorkspace', async (req, res) => {
  const { workbench, name } = req.body;
  const { data } = await drive.files.create({
    requestBody: {
      name: `${name}`,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [`${workbench}`]
    },
    fields: 'name,id'
  });

  res.status(200).send(data.id);
})

router.post('/images', async (req, res) => {
  const { workspace } = req.body;
  const { data } = await drive.files.list({
    q: `"${workspace}" in parents`
  });

  res.status(200).send(data.files);
})

module.exports = router;
