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
      fields: 'id,name'
    });

    res.status(200).send(folder.data.id);
  }
  else if (data.files.length !== 0) {
    // 아이디가 존재할 경우
    res.status(200).send(data.files[0].id);
  }
})

router.post('/workspaces', async (req, res) => {
  const { workbench } = req.body;
  const { data } = await drive.files.list({
    q: `mimeType = "application/vnd.google-apps.folder" and "${workbench}" in parents`,
    orderBy: 'createdTime'
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
    fields: 'id,name'
  });
  const coco = await drive.files.create({
    media: {
      mimeType: 'application/json',
      body: ''
    },
    requestBody: {
      name: 'coco.json',
      parents: [`${data.id}`]
    },
    fields: 'id,name'
  })
  const save = await drive.files.create({
    media: {
      mimeType: 'text/plain',
      body: ''
    },
    requestBody: {
      name: 'save.txt',
      parents: [`${data.id}`]
    },
    fields: 'id,name'
  })

  res.status(200).send(data.id);
})

router.post('/images', async (req, res) => {
  const { workspace } = req.body;
  const { data } = await drive.files.list({
    q: `"${workspace}" in parents and not mimeType="application/json" and not mimeType="text/plain"`,
    orderBy: 'createdTime'
  });

  res.status(200).send(data.files);
})

router.post('/uploadImage', upload.any(), async (req, res) => {
  const { files } = req;
  const { workspace } = req.body;
  const uploadedFiles = [];

  for (let file of files) {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer);
  
    const { data } = await drive.files.create({
      media: {
        mimeType: file.mimeType,
        body: bufferStream
      },
      requestBody: {
        name: file.originalname,
        parents: [`${workspace}`]
      },
      fields: 'id,name'
    });
  
    uploadedFiles.push({
      id: data.id,
      name: data.name
    });
  }

  res.status(200).send(uploadedFiles);
})

router.post('/updateCoco', async (req, res) => {
  const { workspace, images, categories, annotations } = req.body;

  let imageNameArray = [];
  let imagesString = '  "images": [';
  for (let i = 0; i < images?.length; i++) {
    imageNameArray.push(images[i].name);
    imagesString = [imagesString, `
    {
      "file_name": ${images[i].name},
      "height": ${images[i].height},
      "width": ${images[i].width},
      "id": ${i}
    },`].join('');
  }
  imagesString = [imagesString, '\n  ],\n'].join('');

  let categoryNameArray = [];
  let categoriesString = '  "categories": [';
  for (let i = 0; i < categories?.length; i++) {
    categoryNameArray.push(categories[i].name);
    categoriesString = [categoriesString, `
    {
      "supercategory": "Defect",
      "id": ${i},
      "name": ${categories[i].name}
    },`].join('');
  }
  categoriesString = [categoriesString, '\n  ],\n'].join('');

  let annotationsString = '  "annotations": [';
  for (let i = 0; i < annotations?.length; i++) {
    const image_id = imageNameArray.indexOf(annotations[i].image);
    const category_id = categoryNameArray.indexOf(annotations[i].name);

    annotationsString = [annotationsString, `
    {
      "id": ${i},
      "image_id": ${image_id},
      "bbox": [
        ${annotations[i].x},
        ${annotations[i].y},
        ${annotations[i].dx - annotations[i].x},
        ${annotations[i].dy - annotations[i].y}
      ],
      "area": ${(annotations[i].dx - annotations[i].x) * (annotations[i].dy - annotations[i].y)},
      "iscrowd": 0,
      "category_id": ${category_id},
      "segmentation": []
    },`].join('');
  }
  annotationsString = [annotationsString, '\n  ]'].join('');

  const list = await drive.files.list({
    q: `"${workspace}" in parents and mimeType="application/json"`
  });

  const coco = ['{\n', imagesString, categoriesString, annotationsString, '\n}'].join('');
  const { id } = list.data.files[0];
  const { data } = await drive.files.update({
    fileId: `${id}`,
    media: {
      mimeType: 'application/json',
      body: coco
    },
    fields: 'id,name'
  });

  res.status(200).send(data.id);
})

router.post('/getCoco', async (req, res) => {
  const { workspace } = req.body;
  const list = await drive.files.list({
    q: `"${workspace}" in parents and mimeType="application/json"`
  });

  const { id } = list.data.files[0];
  res.status(200).send(id);
})

router.post('/updateSave', async (req, res) => {
  const { workspace, categories, annotations } = req.body;

  let categoriesString = 'categories';
  categories?.forEach((category) => {
    categoriesString = [categoriesString, category.name].join('|');
  });

  let annotationsString = 'annotations';
  annotations?.forEach((annotation) => {
    annotationsString = [annotationsString, `${annotation.image}@${annotation.canvasIndex}@${annotation.name}@${annotation.x}@${annotation.y}@${annotation.dx}@${annotation.dy}`].join('|');
  })

  const list = await drive.files.list({
    q: `"${workspace}" in parents and mimeType="text/plain"`
  });

  const save = [categoriesString, annotationsString].join('\n');
  const { id } = list.data.files[0];
  const { data } = await drive.files.update({
    fileId: `${id}`,
    media: {
      mimeType: 'text/plain',
      body: save
    },
    fields: 'id,name'
  });

  res.status(200).send(data.id);
})

router.post('/getSave', async (req, res) => {
  const { workspace } = req.body;
  const list = await drive.files.list({
    q: `"${workspace}" in parents and mimeType="text/plain"`
  });

  const { id } = list.data.files[0];
  const file = await drive.files.get({
    fileId: id,
    alt: 'media'
  });
  
  res.status(200).send(file.data);
})

module.exports = router;
