window.coachella = angular.module('coachella', ['ui.bootstrap', 'firebase'])
	
	.controller('AppCtrl', function($rootScope, $firebaseSimpleLogin){
		$rootScope.$ref = new Firebase('https://coachellalp.firebaseio.com');
		$rootScope.auth = $firebaseSimpleLogin($rootScope.$ref);
		
		$rootScope.$on('$firebaseSimpleLogin:login', function(e, user){
			$rootScope.$ref.child('users/' + user.uid).set(user);
		});
	})
	.controller('BandsCtrl', function($scope, $rootScope, $firebase) {
		var bandsRef = $rootScope.$ref.child('bands');
		$scope.bands = $firebase(bandsRef);
		$scope.bands.$bind($scope, 'bands');
		
		var usersRef = $rootScope.$ref.child('users');
		$scope.users = $firebase(usersRef);
		$scope.users.$bind($scope, 'users');
		
		$scope.vote = function(band_id, vote){
			var save = function(){
				var voteRef = $scope.bands.$child(band_id + '/votes/' + $rootScope.auth.user.uid);
				
				if($scope.bands[band_id].votes && $scope.bands[band_id].votes[$rootScope.auth.user.uid] && $scope.bands[band_id].votes[$rootScope.auth.user.uid].vote == vote){ // @TODO: why doesn't this work on the voteRef object
					voteRef.$remove();
				} else {
					voteRef.$set({vote: vote});
				}
			}
			if ( ! $rootScope.auth.user){
				$rootScope.auth.$login('facebook').then(function(user){
					save();
				}, function(error){
					console.error(error);
				});
			}else{
				save();
			}
		};
		$scope.mustsee = function(band_id){
			var save = function(){
				var voteRef = $scope.bands.$child(band_id + '/mustsee/' + $rootScope.auth.user.uid);
				
				voteRef.$on('loaded', function(){
					if(voteRef.$value){
						voteRef.$remove();
					} else {
						voteRef.$set(true);
					}
				});
			}
			if ( ! $rootScope.auth.user){
				$rootScope.auth.$login('facebook').then(function(user){
					save();
				}, function(error){
					console.error(error);
				});
			}else{
				save();
			}
		};
		
		$scope.orderBy     = undefined;
		$scope.orderByStr  = undefined;
		$scope.orderByDir  = undefined;
		$scope.toggleOrder = function(key){
			if($scope.orderByStr == key) $scope.orderByDir = ! $scope.orderByDir;
			$scope.orderByStr = key;
			switch(key){
				case 'votes':
					key = function(item){
						var length = 0;
						if(item.votes){
							for(var i in item.votes) length++;
						}
						return length;
					};
					break;
				case 'vote':
					key = function(item){
						var order = -2;
						if(item.votes){
							angular.forEach(item.votes, function(vote, user_uid){
								if(user_uid == $rootScope.auth.user.uid) order = vote.vote;
							});
						}
						return order;
					};
					break;
			}
			$scope.orderBy = key;
			console.log($scope);
		};
		$scope.filterDay = 0;
	})
	.controller('BandCtrl', function($scope) {
		$scope.init = function(band){
			$scope.data = band;
		};
		$scope.$watch('data.votes', function(votes){
			var total = 0;
			angular.forEach(votes, function(item){
				total += item.vote;
			});
			return $scope.data.score = total;
		});
	})
	;