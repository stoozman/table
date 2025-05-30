const express = require('express');
const app = express();
const port = 3001;

app.use(express.json());

app.get('/api', (req, res) => {
    res.send('Hello World!');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
