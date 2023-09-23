require('dotenv').config();
const express = require('express');
const app = express();
const path = require("path");
const fs = require('fs');
const csv = require('csv-parser');

// Make app look for ejs files for Frontend
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

//Body Parser to accept data from forms/ Post Requests
const bodyParser = require('body-parser');
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }));



// |+++++++++++++++++ DATABASE CONNECTION +++++++++++++++++++|
const Pool = require('pg').Pool;
const pool = new Pool({
	user: DB_USER,
	host: DB_HOST,
	database: DB_DATABASE,
	password: DB_PASSWORD,
	dialect: DB_DIALECT,
	port: DB_PORT
});

pool.connect((err, client, release) => {
	if (err) {
		return console.error(
			'Error acquiring client', err.stack)
	}
	client.query('SELECT NOW()', (err, result) => {
		release()
		if (err) {
			return console.error(
				'Error executing query', err.stack)
		}
		console.log("Connected to Database !")
	})
})

// |+++++++++++++++++ HELPER FUNCTIONS +++++++++++++++++++|
function jsonRecursiveAssignment(obj, keys, value) {
    const key = keys[0];

    if (keys.length === 1) {
      obj[key] = value;
    } else {
      if (!obj[key]) {
        obj[key] = {};
      }
      jsonRecursiveAssignment(obj[key], keys.slice(1), value);
    }
}

function validateFilePath(res,path)
{
    if (!path) 
    {
        console.error(path.toString()+' is not defined in the .env file.');
        return res.status(404).json({ message: path.toString()+' is not defined in the .env file.'});
    }
}


function fetchDataForUserTable(jsonObject){
    let dataForDB=[]
    jsonObject.forEach((obj)=>{
        const name= obj['name']['firstName'].toString()+" "+obj['name']['lastName'];
        
        //Add All Keys except these four in additional info
        let mainKeys=['name','age','address']
        let additional_info={}
        for (let key in obj) 
        {
            if(! mainKeys.includes(key))
            {
                additional_info[key]=obj[key];
            }
        }
        dataForDB.push([name, obj['age'], obj['address'], additional_info]);
    })
    return dataForDB;
}

async function addDataToTable(res,query, data)
{
    
    // Execute the SQL query with the JSON data as a parameter
    data.forEach(async (entry)=>{
        try{
            const result = await pool.query(query, entry);
            console.log('Data inserted successfully:', result.rowCount, 'row(s) affected');
            
        }catch(err)
        {
            console.log("Error in Data Addition",err);
            res.status(404).json({message:err});
            
        }
    });
}


//// |+++++++++++++++++ ROUTES +++++++++++++++++++|

//Home Page
app.get('/', function(req,res){
    res.render('index')
})

//Convert CSV to JSON and Add Entires to DB
app.get('/showjson', async function(req,res){
    
    const csvFilePath = process.env.CSV_FILE_PATH;
    
    // Check if the CSV file path is defined
    validateFilePath(res,csvFilePath);
    

    //Create JSON Object to store data
    let jsonObject = [];
    fs.createReadStream(csvFilePath).pipe(csv()).on('data', (row) => 
    {

        let result={}
        for (const key in row) 
        {
            const keys = key.split('.');
            
            //Recursive approach for keys separated by '.'
            jsonRecursiveAssignment(result, keys, row[key]);
            
        }
        jsonObject.push(result);
    })
    .on('end', async () => {

        try {
            //Connect to DB
            await pool.connect();
            console.log('Connected to PostgreSQL');

            //Array that holds the data in required format.
            var dataForDB=fetchDataForUserTable(jsonObject);

            //SQL Query
            const query = `INSERT INTO users(name, age, address, additional_info) VALUES ($1, $2, $3, $4)`;

            

            // //Insert data in DB
            await addDataToTable(res,query,dataForDB);
            
           
            res.render('show_json',{data:jsonObject});

        } catch (err) {
            console.error('Error connecting to PostgreSQL:', err);
        } 
    });

});


app.get('/agedistribution',async function(req,res){

    await pool.connect();
      
    try {
        // Query the database to retrieve ages of all users
        const query = 'SELECT age FROM users'; 
        const result = await pool.query(query);
    
        // Calculate age-group distribution
        let ageGroups = {
        '< 20': 0,
        '20 to 40': 0,
        '40 to 60': 0,
        '> 60': 0,
        };
    
        for (const row of result.rows) {
            const age = row.age;
            if (age < 20) {
                ageGroups['< 20']++;
            } else if (age >= 20 && age <= 40) {
                ageGroups['20 to 40']++;
            } else if (age > 40 && age <= 60) {
                ageGroups['40 to 60']++;
            } else {
                ageGroups['> 60']++;
            }
        }
    
        // Calculate total users
        const totalUsers = result.rows.length;
    
        // Calculate percentage distribution
        for (const group in ageGroups) {
            ageGroups[group] = ((ageGroups[group] / totalUsers) * 100).toFixed(2);
        }
    
        // Print the report
        console.log('Age-Group % Distribution');
        for (const group in ageGroups) {
            console.log(`${group} ${ageGroups[group]}`);
        }
        res.render('distribution',{data:ageGroups});
    } catch (error) {
        console.error('Error calculating age distribution:', error);
    }
})



//Fetch Data from DB and Render on screen.
app.get('/showdb',function(req,res){
    try{
        pool.query('Select * from public.users')
		.then(data => {
            res.render('show_db',{data:data.rows});
		})
    }catch(e){
        console.log("Error while fetching users");
        res.status(404).json({message:'Some Error Occured while fetching Database'});
    }
    
});



// Create a Server and run it on the port 3000
const server = app.listen(3000, function () {
    console.log('Server is running on port 3000');
})



