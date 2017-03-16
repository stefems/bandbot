"use strict"

// Import the dependencies
const cheerio = require("cheerio")
    , req = require("tinyreq")
    ;
let fs = require('fs');
let twit = require('twit');
let RSVP = require('rsvp');

//==================================================
//Heroku Setup
/*
let key = process.env.consumer_key;
let keysecret = process.env.consumer_secret;
let token = process.env.access_token;
let tokensecret = process.env.access_token_secret;
var Twitter = new twit({
    consumer_key:         key,
    consumer_secret:      keysecret,
    access_token:         token,
    access_token_secret:  tokensecret,
});*/
//====================================================
//Local Node Setup
let config = require('./.config.js');
let Twitter = new twit(config);

let tags = null;
let locations = null;
let tweetToReplyTo = "";
let tweetUser = "";
let sortField = "";
setupTwitterBot();


function setupTwitterBot() {
	let scrapeURL = "https://bandcamp.com/tags";
    let filterContent = { selection: "#locations_cloud"};
    /*scrape(scrapeURL, filterContent, (err, data) => {
    	if (!err) {
    		console.log(data.tagArray);
    		fs.readFile("validTags.json", 'utf8', function(err, jsonData) {
		    	if (!err) {
					let jsonObject = JSON.parse(jsonData);
					for(var propertyName in data.tagArray) {
						jsonObject.genres[propertyName] = data.tagArray[propertyName];
					}
					fs.writeFile("validTags.json", JSON.stringify(jsonObject), function(err) {
					    if(err) {
					        return console.log(err);
					    }
					});
	    		}
    		});
    	}
  	});*/
    let tagReading = new RSVP.Promise(function(tagReadingReaction) {
    	fs.readFile("validTags.json", 'utf8', function(err, jsonData) {
	    	if (!err) {
				let json = JSON.parse(jsonData);
				tags = json.genres;
				tagReadingReaction();
	    	}
	    });
    });
    tagReading.then( function() {
    	rateExceeded();
    });
    
}
function rateExceeded() {
	Twitter.get('application/rate_limit_status', handleRateLimit);
}
function handleRateLimit(err, data, response) {
  //console.log(data.resources.friends);
	for (var key in data.resources) {
		if (data.resources.hasOwnProperty(key)) {
		  for (var smallerKey in data.resources[key]) {
		    if (data.resources[key].hasOwnProperty(smallerKey)) {
		      //console.log(smallerKey + " || Remaining:  " + data.resources[key][smallerKey].remaining);
		        if (data.resources[key][smallerKey].remaining < 5) {
		          console.log(smallerKey + " has " + data.resources[key][smallerKey].remaining + " remaining requests. Please wait 15 minutes.");
		          return;
		        }
		    }
		  }
		}
	}
  	console.log("api rate was checked, we're good.");
	getGenreFromMention();

	function getGenreFromMention() {
	  	var stream = Twitter.stream('statuses/filter', { track: "@thebandbot"});
		console.log("streaming, fam!");
	  	stream.on('tweet', handleTweet);
	}
	function handleTweet(tweet) {
		let randomRecent = Math.floor(Math.random() * 2);
		if (randomRecent == 0) {
			sortField = "&sort_field=pop";
		}
		else {
			sortField = "&sort_field=date";
		}
		let hashTags = tweet.entities.hashtags;
		tweetToReplyTo = tweet.id_str;
		tweetUser = "@" + tweet.user.screen_name;
		let areGenres = goodGenres(hashTags);
		//TODO: location tags? Can only use one because the band won't have two locations. :kappa:
		if (areGenres.length != 0) {
		  findBand(areGenres);
		}
		else {
		  console.log("Tweet does not contain a valid genre");
		  Twitter.post('statuses/update', { status: tweetUser + " If you'd like a band recommendation, mention me with tagged music genres!", in_reply_to_status_id: tweetToReplyTo }, function(err, data, response) {
				if (!err) {
				 	console.log(data.text);
				}
				else {
					console.log(err);
				}
			});
		}
	}
	//TODO: handle locations, those come in as hashtags
	function goodGenres(hashTags) {
		let validGenres = [];
		for (let i = 0; i < hashTags.length; i++) {
			let currentGenre = hashTags[i].text.toLowerCase();
			if (tags.hasOwnProperty(currentGenre) == true) {
				if (validGenres.indexOf(currentGenre) == -1) {
					validGenres.push(currentGenre);
				}
			}
		}
		return validGenres;
	}
	//
	function findBand(genreList) {
		//if one tag
		if (genreList.length == 1) {
			//scrape for one album randomly
			scrapeOneTag(genreList);
		}
		else {
			//basically just a 2d array for each genre array of titles
			let bandTitle2DArray =  [];
			//need to scrape for as many tags as there are
			console.log("GenreList length: " + genreList.length);
			scrapeMultipleTags(genreList, 0, bandTitle2DArray, 1);
		}
	}

	function scrapeOneTag(genres) {
		let scrapeURL = "https://bandcamp.com/tag/" + genres[0];
	    let randomPage = Math.floor(Math.random() * (11 - 1) + 1); //1-10
	    if (randomPage != 1) {
	      scrapeURL += "?page=" + randomPage + "&sort_field=pop";
	    }
	    let randomAlbum = Math.floor(Math.random() * (41 - 1) + 1); //1-40
	    let selection = ".item:nth-child(" + randomAlbum + ") a";
	    let filterContent = { url: selection };
	    //getting the URL for the album
	    scrapeForOneAlbum(scrapeURL, filterContent, (err, data) => {
	        if (!err) {
	        	reply(tweetUser, genres, data.url, tweetToReplyTo);
			}
		});
	}

	function scrapeMultipleTags(genres, genreIndex, bandArray, pageNumber) {
		let bandFinding = new RSVP.Promise(function(bandFindingReaction, failureReaction) {
			console.log("index: " + genreIndex);
			console.log("bandarray length: " + bandArray.length);
			console.log("pageNumber: " + pageNumber);
			if (pageNumber < 11) {
				if (genreIndex < genres.length) {
					console.log("Will soon scrape for " + genres[genreIndex]);
					let scrapeURL = "";
					scrapeURL = "https://bandcamp.com/tag/" + tags[genres[genreIndex]] + "?page=" + pageNumber + sortField;
					
					let filterContent = ".item_list";
					console.log("scraping this url: " + scrapeURL);
					//scrape for the current genreIndex
					scrapeForBandNames(scrapeURL, filterContent, (err, data) => {
						if (!err) {
							console.log("scraped for " + genres[genreIndex] + " and found " + data.titleArray.length + " albums.");
							bandArray = bandArray.concat(data.titleArray);
							scrapeMultipleTags(genres, genreIndex + 1, bandArray, pageNumber);
						}
						else {
							console.log("something wrong happened when we scraped for band titles.");
						}
					});
				}
				else {
					bandFindingReaction();
				}
			}
			else {
				console.log("scraped through all 10 pages, lol, we never found an adequate album.");
				failureReaction();
			}			
		  });
		bandFinding.then(
			/* bandFindingReaction() */
			function() {
			console.log("bandFindingReaction has occurred.");
			console.log("bandarray length: " + bandArray.length);
			let counts = [];
			let possibles = [];
			let bestAlbums = [];
		    for(let i = 0; i <= bandArray.length; i++) {
		        if(counts[bandArray[i]] === undefined) {
		            counts[bandArray[i]] = 1;
		        } 
		        else {
		        	possibles.push(bandArray[i]);
		        	counts[bandArray[i]] += 1;
		        }
		    }
		    let bestAlbum = "";
		    for (let i = 0; i < possibles.length; i++) {
		    	let matchSize = 0;
		    	if (pageNumber > 4) {
		    		matchSize = genres.length-1;
		    	}
		    	else {
		    		matchSize = genres.length;
		    	}
		    	if (counts[possibles[i]] >= matchSize) {
		    		bestAlbums.push(possibles[i]);
		    	}
		    }
			if (bestAlbums.length != 0) {
				//we found an album that was listed on each tag scrape, let's use it
				console.log("found albums: " + bestAlbums.length);
				let bestAlbum = bestAlbums[Math.floor(Math.random() * bestAlbums.length)];
				console.log(bestAlbum);
				reply(tweetUser, genres, bestAlbum, tweetToReplyTo);
			}
			else {
				console.log("no adequate album found on page " + pageNumber + ", trying the next page.");
				//start over, but now with page 2
				let delayMillis = 2000; //2 seconds
				setTimeout(function() {
					scrapeMultipleTags(genres, 0, bandArray, pageNumber+1);
				}, delayMillis);
			}
		},
		/* failureReaction() */
		function() {
			//post a reply because we've looked through all of the pages and didn't find an album with the tags.
			Twitter.post('statuses/update', { status: tweetUser + " We couldn't find an album with these tags... We're really bummed, too.", in_reply_to_status_id: tweetToReplyTo }, function(err, data, response) {
				if (!err) {
				 	console.log(data.text);
				}
				else {
					console.log(err);
				}
			});
		});
	}
}

function scrapeForBandNames(url, data, cb) {
	// 1. Create the request
    req(url, (err, body) => {
        if (err) { return cb(err); }

        // 2. Parse the HTML
        let $ = cheerio.load(body)
          , pageData = { "titleArray": []}
          ;
        if ($(data)[0] != null) {
	        // 3. Extract the data
        	let albums = $($(data)[0]).children(".item");
            for (let i = 0; i < albums.length; i++) {
            	//console.log($(albums[i]).children("a").attr("href"));
              	pageData.titleArray.push($(albums[i]).children("a").attr("href"));
            }
	    }
	    else {
	    	console.log("data was null");
	    }
        cb(null, pageData);
    });
}

function reply(username, tags, url, tweetId) {
	let tweetText = username + " " + url;
	let albumTags = new RSVP.Promise(function(albumTagsReaction) {
		let tagContent = {tagDiv: ".tralbum-tags"};
		scrapeTags(url, tags, tagContent, (err, tagData) => {
	        if (!err) {
	        	tags = tags.concat(tagData.tagArray);
	        	albumTagsReaction();
	        }
  		});
	});
	albumTags.then(function() {
		for (let i = 0; i < tags.length; i++) {
		    if ((tweetText.length + 2 + tags[i].length) <= 140) {
		      tweetText += " #" + tags[i];
		    }
		    else {
		      break;
		    }
		}
		console.log("Tweet text: " + tweetText);
		Twitter.post('statuses/update', { status: tweetText, in_reply_to_status_id: tweetId }, function(err, data, response) {
			if (!err) {
			 	console.log(data.text);
			}
			else {
				console.log(err);
			}
		});
	});
}

//set up for scraping the tags off an album page
function scrapeTags(url, oldTags, data, cb) {
  req(url, (err, body) => {
    if (err) { return cb(err); }

    // 2. Parse the HTML
    let $ = cheerio.load(body)
      , pageData = {tagArray: []}
      ;

    // 3. Extract the data
    Object.keys(data).forEach(k => {
      let tags = $(data[k]).children(".tag");
      for (let i = 0; i < tags.length; i++) {
        let modTag = $(tags[i]).text().replace(/ |-|\/|\'/g, "");
        modTag = modTag.replace(/&/g, "and");
        if (oldTags.indexOf(modTag) == -1) {
        	pageData.tagArray.push(modTag);
        }
      }
    });
    cb(null, pageData);
  });
}

function scrapeForOneAlbum(url, data, cb) {
	// 1. Create the request
    req(url, (err, body) => {
        if (err) { return cb(err); }
        // 2. Parse the HTML
        let $ = cheerio.load(body)
          , pageData = {}
          ;
        // 3. Extract the data
        Object.keys(data).forEach(k => {
            pageData[k] = $(data[k]).attr("href");
        });
        // Send the data in the callback
        cb(null, pageData);
    });
}

//Setup for scraping all tags
function scrape(url, data, cb) {
    // 1. Create the request
    req(url, (err, body) => {
        if (err) { return cb(err); }

        // 2. Parse the HTML
        let $ = cheerio.load(body)
          , pageData = { "tagArray": {}}
          ;

        // 3. Extract the data
        Object.keys(data).forEach(k => {
            let tags = $(data[k]).children(".tag");
            for (let i = 0; i < tags.length; i++) {
              let modTag = $(tags[i]).text().replace(/ |-|\/|\'|\.|\,/g, "");
              modTag = modTag.replace(/&/g, "and");
              modTag = modTag.toLowerCase();
              let tagUrl = $(tags[i]).text();
              tagUrl = tagUrl.replace(/ |\&| \& |\//g, "-");
              let tagObject = {url: tagUrl, hashTag: modTag};
              if (modTag.charAt(0) == '8' || modTag == '') {

              }
              else {
              	pageData.tagArray[modTag] = tagUrl;
              }
              //pageData.tagArray.push(tagObject);
            }
        });
       
        // Send the data in the callback
        cb(null, pageData);
    });
}