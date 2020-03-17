import React, { useState, useEffect, useReducer, useRef } from 'react';

function useRandomWikiArticles({
  minContentLength,
  length,
  requestInvalidator,
}) {
  const [loading, setLoading] = useState(false);
  const [randomArticles, setRandomArticles] = useState();
  const [error, setError] = useState();

  useEffect(() => {
    setLoading(true);
    const url = new URL('https://en.wikipedia.org/w/api.php');

    Object.entries({
      format: 'json',
      action: 'query',
      generator: 'random',
      prop: 'info',
      inprop: 'url',
      grnlimit: 50,
      grnnamespace: 0,
      origin: '*',
    }).forEach(([k, v]) => url.searchParams.set(k, v));

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data?.query?.pages) {
          setLoading(false);
          setRandomArticles(
            Object.values(data.query.pages)
              .filter(
                page =>
                  page.length > minContentLength &&
                  !page.title.startsWith('List of')
              )
              .slice(0, length)
          );
        } else {
          throw new Error(
            "data doesn't fit expected format: " + JSON.stringify(data)
          );
        }
      })
      .catch(e => {
        setLoading(false);
        setError(e);
      });

    return () => {
      setLoading(false);
    };
  }, [minContentLength, requestInvalidator, length]);

  return {
    loading,
    error,
    randomArticles,
  };
}

function WikipediaIframe({ article }) {
  const iframe = useRef();

  const iframeStyle = `
  body {
    line-height: 1.4;
  }
  .mw-editsection {
    display: none;
  }
  `;

  useEffect(() => {
    const url = new URL('https://en.wikipedia.org/w/api.php');

    Object.entries({
      format: 'json',
      action: 'parse',
      pageid: article.pageid,
      mobileformat: true,
      prop: 'text',
      origin: '*',
    }).forEach(([k, v]) => url.searchParams.set(k, v));

    fetch(url)
      .then(res => res.json())
      .then(res => {
        const document = iframe.current.contentDocument;
        const style = document.createElement('style');
        style.innerHTML = iframeStyle;
        document.head.appendChild(style);

        document.body.innerHTML =
          `<h1>${article.title}</h1>` + res.parse.text['*'];

        document
          .querySelectorAll('a')
          .forEach(el => el.addEventListener('click', e => e.preventDefault()));
      });
  }, [article.pageid, article.title, iframeStyle]);

  return (
    <iframe
      ref={iframe}
      frameBorder="0"
      title={`Wikipedia page for ${article.title}`}
    />
  );
}

// stage:
// 1. choosing
// 2. reading
// 3. guessing
// 4. recap

function init({ liar, investigator, points }) {
  return {
    liar,
    investigator,
    points,
    stage: 'choosing',
    chosenArticle: null,
    guessCorrect: false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'choose article': {
      return {
        ...state,
        chosenArticle: action.payload,
        stage: 'reading',
      };
    }
    case 'done reading': {
      return {
        ...state,
        stage: 'guessing',
      };
    }
    case 'guess': {
      const { chosenArticle, liar, investigator, points } = state;
      const guessCorrect = action.payload === chosenArticle;

      return {
        ...state,
        stage: 'recap',
        guessCorrect,
        points: {
          [liar]: guessCorrect ? points[liar] : points[liar] + 1,
          [investigator]: guessCorrect
            ? points[investigator] + 1
            : points[investigator],
        },
      };
    }
    case 'next round': {
      const { investigator, liar, points } = state;
      return init({
        liar: investigator,
        investigator: liar,
        points,
      });
    }
    default: {
      throw new Error('wrong dispatch');
    }
  }
}

function TwoPlayerGame({ names }) {
  const [
    { liar, investigator, stage, chosenArticle, guessCorrect, points },
    dispatch,
  ] = useReducer(
    reducer,
    {
      liar: names[0],
      investigator: names[1],
      points: Object.fromEntries(names.map(name => [name, 0])),
    },
    init
  );

  const { loading, error, randomArticles } = useRandomWikiArticles({
    minContentLength: 10_000,
    length: 2,
    requestInvalidator: liar,
  });

  if (loading) {
    return 'loading…';
  }

  if (error) {
    return 'Error: ' + error.message;
  }

  if (!randomArticles) {
    return 'Error: no data';
  }

  if (stage === 'choosing') {
    return (
      <>
        <p>
          It is now the turn of the liar ({liar}). To read up on one topic,
          please pick one of these articles:
        </p>
        <ul className="box-list">
          {randomArticles.map((article, i) => (
            <li key={article.pageid}>
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: 'choose article', payload: article })
                }
              >
                Article {i + 1}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (stage === 'reading') {
    return (
      <div className="flex-column" style={{ height: '100vh', margin: '-1em' }}>
        <WikipediaIframe article={chosenArticle} />
        <button
          class="done-reading"
          type="button"
          onClick={() => dispatch({ type: 'done reading' })}
        >
          I'm done reading
        </button>
      </div>
    );
  }

  if (stage === 'guessing') {
    return (
      <>
        <p>
          It is now the turn of the investigator ({investigator}). You now can
          ask questions about all these articles. Once you think you know which
          article the person read, make a guess!
        </p>
        <ul className="box-list">
          {randomArticles.map(article => (
            <li key={article.pageid}>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'guess', payload: article });
                }}
              >
                {article.title}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (stage === 'recap') {
    return (
      <>
        <p>
          {guessCorrect
            ? `The investigator, ${investigator} won! ${liar} did read about ${chosenArticle.title}`
            : `The liar, ${liar} won! ${liar} actually read about ${chosenArticle.title}`}
        </p>
        <p>scores:</p>
        <ul class="scores-list">
          {Object.entries(points).map(([name, score]) => (
            <li key={name}>
              {name}: {score}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => dispatch({ type: 'next round' })}>
          start next round
        </button>
      </>
    );
  }

  return "Error: game stage doesn't exist";
}

function App() {
  const [started, setStarted] = useState(false);
  const [nameOne, setNameOne] = useState();
  const [nameTwo, setNameTwo] = useState();

  const start = () => setStarted(true);

  return (
    <>
      {started ? (
        <TwoPlayerGame names={[nameOne, nameTwo]} />
      ) : (
        <>
          <p>
            In this game, there are two roles: the investigator and liar. Every
            round you will swap between those roles. The liar will be presented
            with two random Wikipedia pages. They will only be able to read one
            of those.
          </p>
          <p>
            Then the investigator will see the titles of both pages, and given
            the opportunity to ask any questions about both.
          </p>
          <p>Will the investigator find out which page the liar made up?</p>
          <form
            className="flex-column child-spacing"
            onSubmit={e => {
              e.preventDefault();
              start();
            }}
          >
            <label>
              Player one:{' '}
              <input
                required
                type="text"
                defaultValue={nameOne}
                onChange={e => setNameOne(e.target.value)}
              />
            </label>
            <label>
              Player two:{' '}
              <input
                required
                type="text"
                defaultValue={nameTwo}
                onChange={e => setNameTwo(e.target.value)}
              />
            </label>
            <button style={{ padding: '.5em' }}>Start!</button>
          </form>
        </>
      )}
    </>
  );
}

export default App;
